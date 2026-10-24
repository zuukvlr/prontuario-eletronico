/** Utilitários de data no padrão brasileiro (DD/MM/AAAA) e fuso America/Sao_Paulo (UTC-03, sem horário de verão). */
export const TIME_ZONE = 'America/Sao_Paulo'
const BR_OFFSET = '-03:00'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false })

function invalid(d: Date | undefined | null): d is undefined | null {
  return !d || Number.isNaN(d.getTime())
}

export function formatDate(d: Date | undefined | null): string {
  return invalid(d) ? '—' : dateFmt.format(d)
}

export function formatTime(d: Date | undefined | null): string {
  return invalid(d) ? '—' : timeFmt.format(d)
}

export function formatDateTime(d: Date | undefined | null): string {
  return invalid(d) ? '—' : `${formatDate(d)} às ${formatTime(d)}`
}

/** "2026-10-01" -> "01/10/2026" (sem conversão de fuso). */
export function formatIsoDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function parts(d: Date) {
  const get = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, hour12: false, ...opts }).format(d)
  return {
    date: get({ year: 'numeric', month: '2-digit', day: '2-digit' }), // YYYY-MM-DD
    time: get({ hour: '2-digit', minute: '2-digit' }).replace(/^24:/, '00:'),
  }
}

/** Date -> valor de <input type="datetime-local"> no fuso do Brasil. */
export function toDateTimeInput(d: Date): string {
  const p = parts(d)
  return `${p.date}T${p.time}`
}

/** Valor de <input type="datetime-local"> (horário de Brasília) -> Date. */
export function fromDateTimeInput(value: string): Date {
  return new Date(`${value}:00${BR_OFFSET}`)
}

/** Data (YYYY-MM-DD) de um instante, no fuso do Brasil. */
export function toIsoDate(d: Date): string {
  return parts(d).date
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

export function startOfDay(iso: string): Date {
  return new Date(`${iso}T00:00:00${BR_OFFSET}`)
}

export function endOfDay(iso: string): Date {
  return new Date(`${iso}T23:59:59.999${BR_OFFSET}`)
}

export function calcAge(birthIso: string, ref: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const today = parts(ref).date.split('-').map(Number)
  let age = today[0] - y
  if (today[1] < mo || (today[1] === mo && today[2] < d)) age--
  return age >= 0 ? age : null
}

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}
