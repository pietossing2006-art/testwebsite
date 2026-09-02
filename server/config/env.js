import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function parseBoolean(val, fallback = false) {
  if (val === undefined || val === null) return fallback
  return TRUE_VALUES.has(String(val).trim().toLowerCase())
}

function normalizeOriginValue(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase()
}

const rawOrigins = process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173,https://www.vxpers.com,https://key.vxpers.com'
const clientOrigins = rawOrigins
  .split(',')
  .map(normalizeOriginValue)
  .filter(Boolean)

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT ? Number(process.env.PORT) : 3001,
  TRUST_PROXY: parseBoolean(process.env.TRUST_PROXY, true),
  CLIENT_ORIGINS: clientOrigins,
  CLIENT_ORIGIN_SET: new Set(clientOrigins),
  ALLOW_LOCAL_DEV_ORIGINS: parseBoolean(
    process.env.ALLOW_LOCAL_DEV_ORIGINS,
    process.env.NODE_ENV !== 'production',
  ),
  ALLOW_NULL_ORIGIN: parseBoolean(
    process.env.ALLOW_NULL_ORIGIN,
    process.env.NODE_ENV !== 'production',
  ),
  PG: {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD == null ? undefined : String(process.env.PGPASSWORD),
    database: process.env.PGDATABASE || 'neonshop',
  },
  DISCORD: {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
    REDIRECT_URI: process.env.DISCORD_REDIRECT_URI || '',
  },
  SERVE_CLIENT: parseBoolean(process.env.SERVE_CLIENT, process.env.NODE_ENV === 'production'),
})
