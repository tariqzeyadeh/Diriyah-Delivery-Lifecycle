import net from 'node:net'
import { prisma } from '@/lib/prisma'

/** Prisma P1001 / initialization errors when Aiven (or any MySQL host) is down. */
export function isPrismaUnreachable(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : ''
  if (code === 'P1001' || code === 'P1000' || code === 'P1017') return true
  const name = err instanceof Error ? err.name : ''
  if (name === 'PrismaClientInitializationError') return true
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("Can't reach database server")
}

function mysqlHostPort(): { host: string; port: number } | null {
  const raw = process.env.DATABASE_URL
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (!url.hostname) return null
    return { host: url.hostname, port: Number(url.port || 3306) }
  } catch {
    return null
  }
}

function tcpReachable(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const finish = (ok: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

let cachedReachable: { ok: boolean; at: number } | null = null
let inflightProbe: Promise<boolean> | null = null
const TTL_UP_MS = 5_000
const TTL_DOWN_MS = 15_000

/** TCP probe first so a sleeping Aiven host never hits Prisma (no console overlay). */
export function probeDatabase(): Promise<boolean> {
  const now = Date.now()
  if (cachedReachable) {
    const ttl = cachedReachable.ok ? TTL_UP_MS : TTL_DOWN_MS
    if (now - cachedReachable.at < ttl) return Promise.resolve(cachedReachable.ok)
  }
  if (inflightProbe) return inflightProbe

  inflightProbe = (async () => {
    const target = mysqlHostPort()
    const tcpOk = target ? await tcpReachable(target.host, target.port) : true
    if (!tcpOk) {
      cachedReachable = { ok: false, at: Date.now() }
      return false
    }
    try {
      await prisma.$queryRaw`SELECT 1`
      cachedReachable = { ok: true, at: Date.now() }
      return true
    } catch (err) {
      if (!isPrismaUnreachable(err)) throw err
      cachedReachable = { ok: false, at: Date.now() }
      return false
    }
  })().finally(() => {
    inflightProbe = null
  })

  return inflightProbe
}

function markUnreachable() {
  cachedReachable = { ok: false, at: Date.now() }
}

/**
 * Run `load` only after a shared reachability probe.
 * Pass a factory so Prisma is not invoked when the host is down.
 */
export async function settleDatabase<T>(
  load: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; unreachable: boolean }> {
  if (!(await probeDatabase())) {
    return { value: fallback, unreachable: true }
  }
  try {
    return { value: await load(), unreachable: false }
  } catch (err) {
    if (isPrismaUnreachable(err)) {
      markUnreachable()
      return { value: fallback, unreachable: true }
    }
    throw err
  }
}
