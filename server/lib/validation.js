import { z } from 'zod'

const ERROR_CODE_RE = /^[a-z][a-z0-9_]*$/

export { z }

export function requiredString(errorCode = 'invalid_payload') {
  return z.custom((value) => typeof value === 'string', { message: errorCode })
}

export function validationErrorCode(error, fallbackError = 'invalid_payload') {
  const issue = error?.issues?.[0]
  const message = String(issue?.message || '').trim()
  return ERROR_CODE_RE.test(message) ? message : fallbackError
}

export function validateBody(schema, body, { fallbackError = 'invalid_payload' } = {}) {
  const parsed = schema.safeParse(body ?? {})
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, error: validationErrorCode(parsed.error, fallbackError) }
}
