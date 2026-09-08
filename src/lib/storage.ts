import { createHash } from 'crypto'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Evidence Vault — S3-compatible object storage (AWS S3 or Azure Blob via S3 API gateway).
 * Clients upload large PDFs/Excel directly using a short-lived presigned URL,
 * avoiding Next.js / Vercel request body size limits (~4.5MB).
 */

export type PresignedUploadInput = {
  /** Logical object key prefix, e.g. masterTraceId / gateCode */
  keyPrefix: string
  fileName: string
  contentType: string
  /** Optional content length hint for future policy enforcement */
  contentLength?: number
  /** Seconds until the upload URL expires (default 15 minutes) */
  expiresInSeconds?: number
}

export type PresignedUploadResult = {
  uploadUrl: string
  objectKey: string
  bucket: string
  expiresInSeconds: number
  /** Client should send this header when PUT-ing the file */
  requiredHeaders: Record<string, string>
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`[storage] Missing required environment variable: ${name}`)
  }
  return value
}

function getS3Client(): S3Client {
  const region = process.env.AWS_REGION ?? process.env.S3_REGION ?? 'eu-central-1'
  const endpoint = process.env.S3_ENDPOINT // optional — MinIO / Azure S3 bridge

  return new S3Client({
    region,
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        }
      : {}),
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  })
}

function getBucket(): string {
  return requireEnv('S3_BUCKET')
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
}

/**
 * Generate a short-lived HTTPS PUT URL so the browser uploads evidence
 * straight into the vault (Attachment.file_checksum filled after verify).
 */
export async function generatePresignedUploadUrl(
  input: PresignedUploadInput,
): Promise<PresignedUploadResult> {
  const bucket = getBucket()
  const client = getS3Client()
  const expiresInSeconds = input.expiresInSeconds ?? 15 * 60
  const safeName = sanitizeFileName(input.fileName)
  const objectKey = `${input.keyPrefix.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${safeName}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: input.contentType,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds })

  return {
    uploadUrl,
    objectKey,
    bucket,
    expiresInSeconds,
    requiredHeaders: {
      'Content-Type': input.contentType,
    },
  }
}

export type ChecksumAlgorithm = 'sha256' | 'sha512'

export type VerifyChecksumResult = {
  objectKey: string
  algorithm: ChecksumAlgorithm
  checksumHex: string
  sizeBytes: number
  contentType?: string
  /** True when expectedChecksum was provided and matched */
  matched: boolean | null
}

/**
 * Background/verification job: stream object from the vault, compute digest,
 * and return the value to persist on Attachment.file_checksum (BR evidence).
 *
 * Call after the client finishes the presigned PUT (and preferably after AV scan).
 */
export async function verifyFileChecksum(options: {
  objectKey: string
  /** When set, compare against the vault digest (e.g. client-side pre-hash) */
  expectedChecksum?: string
  algorithm?: ChecksumAlgorithm
}): Promise<VerifyChecksumResult> {
  const bucket = getBucket()
  const client = getS3Client()
  const algorithm = options.algorithm ?? 'sha256'

  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: options.objectKey,
    }),
  )

  const get = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: options.objectKey,
    }),
  )

  const hash = createHash(algorithm)
  const body = get.Body
  if (!body) {
    throw new Error(`[storage] Empty body for objectKey=${options.objectKey}`)
  }

  // Node.js Readable / web stream from AWS SDK v3
  const stream = body as AsyncIterable<Uint8Array>
  for await (const chunk of stream) {
    hash.update(chunk)
  }

  const checksumHex = hash.digest('hex')
  const expected = options.expectedChecksum?.toLowerCase().replace(/^sha-?256:/i, '')
  const matched =
    expected === undefined ? null : expected.toLowerCase() === checksumHex.toLowerCase()

  if (matched === false) {
    throw new Error(
      `[storage] Checksum mismatch for ${options.objectKey}: expected ${expected}, got ${checksumHex}`,
    )
  }

  return {
    objectKey: options.objectKey,
    algorithm,
    checksumHex,
    sizeBytes: head.ContentLength ?? 0,
    contentType: head.ContentType,
    matched,
  }
}

/** Convenience helper for Attachment rows — store as `sha256:<hex>`. */
export function formatChecksumForDb(hex: string, algorithm: ChecksumAlgorithm = 'sha256'): string {
  return `${algorithm}:${hex}`
}
