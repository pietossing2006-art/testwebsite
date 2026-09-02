import crypto from 'node:crypto'
import pg from 'pg'
import argon2 from 'argon2'
const { Pool } = pg

const ORDER_REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // 32 chars (unambiguous base32)


export function generateOrderRef() {
  const bytes = crypto.randomBytes(12)
  let chars = ''
  for (let i = 0; i < 12; i++) {
    chars += ORDER_REF_ALPHABET[bytes[i] % ORDER_REF_ALPHABET.length]
  }
  return `ORD-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}


let _pool = null


function ensurePool() {
  if (_pool) return _pool
  _pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD == null ? undefined : String(process.env.PGPASSWORD),
    database: process.env.PGDATABASE || 'neonshop',
  })
  return _pool
}


export const pool = {
  query: (...args) => ensurePool().query(...args),
  connect: (...args) => ensurePool().connect(...args),
  end: (...args) => ensurePool().end(...args),
}


export async function query(sql, params = []) {
  const res = await ensurePool().query(sql, params)
  return res
}


export async function get(sql, params = []) {
  const res = await query(sql, params)
  return res.rows[0] ?? null
}


export async function all(sql, params = []) {
  const res = await query(sql, params)
  return res.rows
}


const PBKDF2_ITERATIONS = 120_000


export async function hashPassword(password) {
  return argon2.hash(String(password), {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  })
}


function verifyLegacyPbkdf2Password(password, stored) {
  const [salt, expected] = String(stored).split(':')
  if (!salt || !expected) return false
  const derived = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (expectedBuffer.length !== derived.length) return false
  return crypto.timingSafeEqual(derived, expectedBuffer)
}


export async function verifyPassword(password, stored) {
  const hash = String(stored || '')
  if (!hash) return false
  if (hash.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, String(password))
    } catch {
      return false
    }
  }
  return verifyLegacyPbkdf2Password(password, hash)
}


export async function getAppSettingJson(key) {
  const row = await get('SELECT value_json FROM app_settings WHERE key = $1', [String(key)])
  if (!row) return null
  if (row.value_json && typeof row.value_json === 'object') return row.value_json
  return null
}


export async function upsertAppSettingJson(key, value) {
  await query(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key)
     DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()`,
    [String(key), JSON.stringify(value ?? {})],
  )
}

