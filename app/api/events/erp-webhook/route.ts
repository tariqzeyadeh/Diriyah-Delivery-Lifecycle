import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import {
  applyErpSpendUpdate,
  parseCloudEvents,
  verifyErpWebhookHmac,
} from '@/src/lib/predictive-risk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Event-driven ERP sync — Azure Event Grid / SAP CloudEvents webhook.
 *
 * Auth: HMAC-SHA256 over raw body using `ERP_WEBHOOK_HMAC_SECRET`
 *   Header: `x-atlas-signature: sha256=<hex>` (or Azure `aeg-signature` / `x-sap-signature`)
 *
 * Also handles Event Grid subscription validation handshake.
 */
export async function POST(req: Request) {
  const secret = process.env.ERP_WEBHOOK_HMAC_SECRET
  const rawBody = await req.text()

  // Azure Event Grid subscription validation (webhook handshake)
  try {
    const probe = JSON.parse(rawBody) as unknown
    const events = Array.isArray(probe) ? probe : [probe]
    const validation = events.find(
      (e: { eventType?: string; data?: { validationCode?: string } }) =>
        e?.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent',
    ) as { data?: { validationCode?: string } } | undefined

    if (validation?.data?.validationCode) {
      return NextResponse.json({ validationResponse: validation.data.validationCode })
    }
  } catch {
    // not JSON — fall through to signature check
  }

  if (!secret) {
    if (process.env.ERP_WEBHOOK_ALLOW_INSECURE === 'true') {
      // local scaffold only
    } else {
      return NextResponse.json(
        { error: 'ERP_WEBHOOK_HMAC_SECRET is not configured' },
        { status: 503 },
      )
    }
  } else {
    const signature =
      req.headers.get('x-atlas-signature') ||
      req.headers.get('x-sap-signature') ||
      req.headers.get('aeg-signature') ||
      req.headers.get('x-eventgrid-signature')

    // aeg-signature may be comma-separated key=value; try primary HMAC first
    const ok =
      verifyErpWebhookHmac(rawBody, signature, secret) ||
      verifyAzureAegSignature(rawBody, signature, secret)

    if (!ok) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const cloudEvents = parseCloudEvents(parsed)
  const results: { procurement_item_id?: string; updated: boolean; type?: string }[] = []

  for (const event of cloudEvents) {
    const type = event.eventType || event.type || 'unknown'
    if (
      type.includes('SubscriptionValidation') ||
      type === 'Microsoft.EventGrid.SubscriptionValidationEvent'
    ) {
      continue
    }

    // PO / Invoice / spend actuals
    if (
      /purchase.?order|invoice|spend|commitment|procurement/i.test(type) ||
      event.data?.procurementItemId
    ) {
      const applied = await applyErpSpendUpdate(event)
      results.push({ ...applied, type })
    }
  }

  const anyUpdated = results.some((r) => r.updated)
  if (anyUpdated) {
    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    updated: results.filter((r) => r.updated).length,
    results,
    revalidated: anyUpdated ? [CACHE_TAGS.PORTFOLIO_METRICS] : [],
  })
}

function verifyAzureAegSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false
  // Some Event Grid deliveries use Base64 HMAC of the body with the access key
  try {
    const expected = createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(rawBody, 'utf8')
      .digest('base64')
    const a = Buffer.from(header.trim())
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
