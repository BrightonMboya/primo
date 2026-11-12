/** Money is stored in whole Rwandan francs (RWF has no coins in use, so no decimals). */
export function rwf(amount: number | null | undefined): string {
  return `${Math.round(amount ?? 0).toLocaleString('en-US')} RWF`
}

/** Turns what staff type ("18,000", "18000 RWF") into a whole number of francs. */
export function toAmount(input: string | number): number {
  const n = typeof input === 'number' ? input : Number(String(input).replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}
/** Show a timestamp in the phone's local time. */
export function when(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`
}

export function skuPart(value: string, len = 3): string {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return clean.slice(0, len) || 'X'
}
