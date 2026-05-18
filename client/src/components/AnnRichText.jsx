import { Fragment, useMemo, useState } from 'react'
import { copyToClipboard } from '../api.js'

const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|==[^=]+==)/g

function parseTokens(text) {
  const value = String(text ?? '')
  if (!value) return []
  const parts = []
  let last = 0
  let match
  while ((match = INLINE_TOKEN_RE.exec(value)) !== null) {
    const index = match.index
    if (index > last) parts.push({ type: 'plain', text: value.slice(last, index) })
    const raw = match[0]
    if (raw.startsWith('**') && raw.endsWith('**')) {
      parts.push({ type: 'bold', text: raw.slice(2, -2) })
    } else if (raw.startsWith('__') && raw.endsWith('__')) {
      parts.push({ type: 'underline', text: raw.slice(2, -2) })
    } else if (raw.startsWith('==') && raw.endsWith('==')) {
      parts.push({ type: 'highlight', text: raw.slice(2, -2) })
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      parts.push({ type: 'italic', text: raw.slice(1, -1) })
    } else {
      parts.push({ type: 'plain', text: raw })
    }
    last = index + raw.length
  }
  if (last < value.length) parts.push({ type: 'plain', text: value.slice(last) })
  return parts
}

export default function AnnRichText({ text, className = '', plainHighlight = false }) {
  const [copiedKey, setCopiedKey] = useState('')
  const tokens = useMemo(() => parseTokens(text), [text])

  async function copyHighlighted(value, key) {
    const ok = await copyToClipboard(value)
    if (!ok) return
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? '' : prev))
    }, 1000)
  }

  if (!tokens.length) return null

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        const key = `${token.type}-${idx}`
        if (token.type === 'bold') return <strong key={key}>{token.text}</strong>
        if (token.type === 'italic') return <em key={key}>{token.text}</em>
        if (token.type === 'underline') return <u key={key}>{token.text}</u>
        if (token.type === 'highlight') {
          if (plainHighlight) return <Fragment key={key}>{token.text}</Fragment>
          const copied = copiedKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void copyHighlighted(token.text, key)
              }}
              title={copied ? 'คัดลอกแล้ว' : 'คลิกเพื่อคัดลอก'}
              className={`mx-[1px] inline-flex items-center rounded-md border px-1.5 py-[1px] font-extrabold leading-tight shadow-[0_0_0_1px_rgba(0,0,0,0.22)] transition ${copied ? 'border-emerald-50/90 bg-emerald-300 text-slate-950 shadow-[0_0_0_1px_rgba(6,78,59,0.28),0_0_14px_rgba(16,185,129,0.45)]' : 'border-amber-50/90 bg-amber-200 text-slate-950 shadow-[0_0_0_1px_rgba(120,53,15,0.24),0_0_14px_rgba(251,191,36,0.5)] hover:bg-amber-100'}`}
            >
              {token.text}
            </button>
          )
        }
        return <Fragment key={key}>{token.text}</Fragment>
      })}
    </span>
  )
}
