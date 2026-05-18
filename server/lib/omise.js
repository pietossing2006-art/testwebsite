export async function omiseRequest(pathname, { method = 'GET', body } = {}) {
  const secret = process.env.OMISE_SECRET_KEY ? String(process.env.OMISE_SECRET_KEY) : ''
  if (!secret) {
    const e = new Error('omise_not_configured')
    e.status = 500
    throw e
  }
  const auth = Buffer.from(`${secret}:`).toString('base64')
  const res = await fetch(`https://api.omise.co${pathname}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error('omise_request_failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}
