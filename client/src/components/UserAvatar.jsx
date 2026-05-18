import { useMemo, useState } from 'react'
import { resolveApiUrl } from '../api.js'

const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 96,
  hero: 128,
}

const ROLE_TONES = {
  owner: ['#22d3ee', '#a78bfa'],
  admin: ['#06b6d4', '#2563eb'],
  finance: ['#34d399', '#0ea5e9'],
  support: ['#38bdf8', '#14b8a6'],
  booster: ['#f59e0b', '#06b6d4'],
  user: ['#22d3ee', '#0f172a'],
}

function hashText(value) {
  const text = String(value || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getDisplayName(user, fallback = 'user') {
  if (typeof user === 'string') return user || fallback
  return (
    user?.display_name ||
    user?.displayName ||
    user?.username ||
    user?.email?.split('@')?.[0] ||
    fallback
  )
}

function getAvatarSrc(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  if (raw.startsWith('/')) return resolveApiUrl(raw)
  return raw
}

function getAvatarInitials(userOrName, fallback = 'U') {
  const name = getDisplayName(userOrName, fallback).trim()
  if (!name) return fallback
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  return Array.from(name).slice(0, 2).join('').toUpperCase()
}

function getTone(user, name) {
  const role = String(user?.role || '').toLowerCase()
  if (ROLE_TONES[role]) return ROLE_TONES[role]
  const palettes = Object.values(ROLE_TONES)
  return palettes[hashText(name || user?.email) % palettes.length]
}

export default function UserAvatar({
  user,
  name,
  src,
  email,
  size = 'md',
  rounded = 'xl',
  className = '',
  imageClassName = '',
  style,
  title,
  alt,
  status,
}) {
  const displayName = name || getDisplayName(user || { email }, 'user')
  const resolvedSrc = useMemo(() => getAvatarSrc(src || user?.avatar_url || user?.avatarUrl), [src, user?.avatar_url, user?.avatarUrl])
  const [failedSrc, setFailedSrc] = useState('')

  const numericSize = typeof size === 'number' ? size : SIZE_MAP[size]
  const initials = getAvatarInitials(displayName)
  const [toneA, toneB] = getTone(user, displayName)
  const radius = rounded === 'full' ? '999px' : rounded === 'lg' ? '18px' : rounded === 'md' ? '14px' : rounded === 'sm' ? '10px' : '16px'
  const canShowImage = Boolean(resolvedSrc && failedSrc !== resolvedSrc)

  return (
    <span
      className={`user-avatar ${className}`}
      title={title || displayName}
      style={{
        width: numericSize,
        height: numericSize,
        minWidth: numericSize,
        minHeight: numericSize,
        '--avatar-size': numericSize ? `${numericSize}px` : undefined,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${toneA}, ${toneB})`,
        ...style,
      }}
    >
      {canShowImage ? (
        <img
          src={resolvedSrc}
          alt={alt || `${displayName} avatar`}
          className={`user-avatar__image ${imageClassName}`}
          onError={() => setFailedSrc(resolvedSrc)}
          loading="lazy"
        />
      ) : (
        <span className="user-avatar__initials">{initials}</span>
      )}
      {status ? <span className={`user-avatar__status is-${status}`} /> : null}
    </span>
  )
}
