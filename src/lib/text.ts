/** Remove acentos, coloca em minúsculas e comprime espaços. */
export function normalize(input: string | undefined | null): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'com', 'sem', 'por', 'para', 'que', 'se', 'ao', 'ou', 'foi', 'mais', 'muito',
])

/** Tokens normalizados (palavras com 3+ letras, sem stopwords) para pesquisa. */
export function tokenize(...texts: Array<string | undefined | null>): string[] {
  const set = new Set<string>()
  for (const t of texts) {
    for (const w of normalize(t).split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && !STOPWORDS.has(w)) set.add(w)
    }
  }
  return [...set].slice(0, 400)
}

export function digitsOnly(s: string | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

export function formatPhone(s: string | undefined): string {
  const d = digitsOnly(s)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return s ?? ''
}

export function shortId(id: string): string {
  return id.slice(0, 6).toUpperCase()
}

export function recordCode(id: string): string {
  return `REG-${shortId(id)}`
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}
