import type { ClinicalRecord } from '@/types'
import { formatDate, toIsoDate } from '@/lib/date'
import { normalize, recordCode, tokenize } from '@/lib/text'

/**
 * Reconhecimento de termos clínicos por regras (sem IA). Tudo aqui é EXTRAÇÃO do texto registrado:
 * nada é inferido, interpretado clinicamente ou classificado como normal/anormal.
 */

export type VitalKey = 'pa' | 'fc' | 'fr' | 'spo2' | 'temp' | 'peso' | 'glicemia'

export const VITAL_LABEL: Record<VitalKey, string> = {
  pa: 'Pressão arterial',
  fc: 'Frequência cardíaca',
  fr: 'Frequência respiratória',
  spo2: 'Saturação de O₂',
  temp: 'Temperatura',
  peso: 'Peso',
  glicemia: 'Glicemia',
}

const VITAL_PATTERNS: Array<{ key: VitalKey; re: RegExp; fmt: (m: RegExpExecArray) => string }> = [
  { key: 'pa', re: /\b(?:PA|press[aã]o(?: arterial)?)\s*[:=]?\s*(\d{2,3})\s*[xX/]\s*(\d{2,3})(?:\s*mm\s?hg)?/gi, fmt: (m) => `${m[1]}x${m[2]} mmHg` },
  { key: 'fc', re: /\b(?:FC|freq(?:u[eê]ncia)? card[ií]aca)\s*[:=]?\s*(\d{2,3})(?:\s*bpm)?/gi, fmt: (m) => `${m[1]} bpm` },
  { key: 'fr', re: /\b(?:FR|freq(?:u[eê]ncia)? respirat[oó]ria)\s*[:=]?\s*(\d{1,2})(?:\s*irpm|\s*rpm)?/gi, fmt: (m) => `${m[1]} irpm` },
  { key: 'spo2', re: /\b(?:SpO2|SatO2|satura[cç][aã]o(?: de (?:O2|oxig[eê]nio))?|sat)\s*[:=]?\s*(\d{2,3})\s*%/gi, fmt: (m) => `${m[1]}%` },
  { key: 'temp', re: /\b(?:T|Tax|temp(?:eratura)?)\s*[:=]?\s*(\d{2}(?:[.,]\d)?)\s*(?:°|º)?\s*C\b/gi, fmt: (m) => `${m[1].replace('.', ',')} °C` },
  { key: 'peso', re: /\bpeso\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*kg\b/gi, fmt: (m) => `${m[1].replace('.', ',')} kg` },
  { key: 'glicemia', re: /\b(?:glicemia|HGT|dextro)\s*[:=]?\s*(\d{2,3})(?:\s*mg\s?\/\s?dl)?/gi, fmt: (m) => `${m[1]} mg/dL` },
]

export interface VitalReading {
  key: VitalKey
  value: string
  recordId: string
  at: Date
}

function recordText(r: ClinicalRecord): string {
  const c = r.content
  return [c.reportedSymptoms, c.observedFindings, c.evolution, c.assessment, c.examResults, c.additionalNotes, c.chiefComplaint].filter(Boolean).join(' \n ')
}

/** Valores objetivos citados no texto (PA, FC, FR, SpO₂, temperatura, peso, glicemia). */
export function extractVitals(records: ClinicalRecord[]): VitalReading[] {
  const out: VitalReading[] = []
  for (const r of records) {
    const text = recordText(r)
    for (const p of VITAL_PATTERNS) {
      p.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = p.re.exec(text))) out.push({ key: p.key, value: p.fmt(m), recordId: r.id, at: r.attendedAt })
    }
  }
  return out
}

export function vitalsSection(records: ClinicalRecord[]): { title: string; body: string; refs: string[] } | null {
  const readings = extractVitals(records)
  if (!readings.length) return null
  const lines: string[] = []
  const refs = new Set<string>()
  for (const key of Object.keys(VITAL_LABEL) as VitalKey[]) {
    const list = readings.filter((x) => x.key === key)
    if (!list.length) continue
    list.forEach((x) => refs.add(x.recordId))
    lines.push(`• ${VITAL_LABEL[key]}: ${list.map((x) => `${x.value} (${formatDate(x.at)} [${recordCode(x.recordId)}])`).join(' → ')}`)
  }
  lines.push('Valores transcritos do texto dos registros, em ordem cronológica, sem interpretação de normalidade.')
  return { title: 'Dados objetivos citados nos registros', body: lines.join('\n'), refs: [...refs] }
}

/** Abreviações usuais encontradas. Expansão é apenas auxílio de leitura: confirmar no registro original. */
const GLOSSARY: Record<string, string> = {
  vo: 'via oral',
  ev: 'endovenosa',
  im: 'intramuscular',
  sc: 'subcutânea',
  sl: 'sublingual',
  sos: 'se necessário',
  pa: 'pressão arterial',
  fc: 'frequência cardíaca',
  fr: 'frequência respiratória',
  spo2: 'saturação periférica de oxigênio',
  has: 'hipertensão arterial sistêmica',
  dm: 'diabetes mellitus',
  dpoc: 'doença pulmonar obstrutiva crônica',
  ivas: 'infecção de vias aéreas superiores',
  itu: 'infecção do trato urinário',
  avc: 'acidente vascular cerebral',
  iam: 'infarto agudo do miocárdio',
  rx: 'radiografia',
  tc: 'tomografia computadorizada',
  rm: 'ressonância magnética',
  eco: 'ecocardiograma',
  ecg: 'eletrocardiograma',
  hgt: 'glicemia capilar',
  bpm: 'batimentos por minuto',
  irpm: 'incursões respiratórias por minuto',
  ssvv: 'sinais vitais',
  mmii: 'membros inferiores',
  mmss: 'membros superiores',
}

export function glossarySection(records: ClinicalRecord[]): { title: string; body: string; refs: string[] } | null {
  const found = new Map<string, Set<string>>()
  for (const r of records) {
    const text = [recordText(r), r.content.conduct, r.content.guidance, ...(r.content.medications ?? []).map((m) => `${m.route ?? ''} ${m.frequency ?? ''}`)].filter(Boolean).join(' ')
    for (const w of text.split(/[^A-Za-zÀ-ÿ0-9]+/)) {
      const key = normalize(w)
      // siglas aparecem em maiúsculas no texto; evita confundir com palavras comuns ("im", "eco", "sc")
      if (GLOSSARY[key] && w === w.toUpperCase() && w.length >= 2) {
        found.set(key, (found.get(key) ?? new Set()).add(r.id))
      }
    }
  }
  if (!found.size) return null
  const lines = [...found.entries()].map(([k]) => `• ${k.toUpperCase()}: ${GLOSSARY[k]}`)
  lines.push('Expansões usuais apenas para facilitar a leitura; o significado exato é o do registro original.')
  return { title: 'Glossário de abreviações encontradas', body: lines.join('\n'), refs: [...new Set([...found.values()].flatMap((s) => [...s]))] }
}

/** Termos de queixa/sintoma e em quais registros aparecem (persistência documentada, sem conclusão clínica). */
export function symptomPersistence(chrono: ClinicalRecord[]): { title: string; body: string; refs: string[] } | null {
  if (chrono.length < 2) return null
  const perRecord = chrono.map((r) => ({ r, tokens: new Set(tokenize(r.content.chiefComplaint, r.content.reportedSymptoms)) }))
  const all = new Map<string, number[]>()
  perRecord.forEach((p, i) => p.tokens.forEach((t) => all.set(t, [...(all.get(t) ?? []), i])))
  const lines: string[] = []
  const refs = new Set<string>()
  const generic = new Set(['paciente', 'refere', 'relata', 'queixa', 'retorno', 'acompanhamento', 'melhora', 'parcial', 'sintomas'])
  for (const [term, idx] of [...all.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    if (idx.length < 2 || generic.has(term)) continue
    const dates = idx.map((i) => `${formatDate(chrono[i].attendedAt)} [${recordCode(chrono[i].id)}]`).join(', ')
    const last = idx[idx.length - 1]
    const tail = last < chrono.length - 1 ? ` Não citado nos registros seguintes (isso não significa resolução).` : ''
    lines.push(`• "${term}": citado em ${idx.length} registros — ${dates}.${tail}`)
    idx.forEach((i) => refs.add(chrono[i].id))
    if (lines.length >= 12) break
  }
  if (!lines.length) return null
  lines.push('Levantamento de palavras repetidas nas queixas e sintomas registrados; não é avaliação de evolução clínica.')
  return { title: 'Termos recorrentes nas queixas e sintomas', body: lines.join('\n'), refs: [...refs] }
}

/** Texto corrido, em português, citando literalmente o que foi registrado. */
export function proseParagraph(r: ClinicalRecord, typeLabel: string): string {
  const c = r.content
  const q = (s?: string) => `“${(s ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, '')}”`
  const has = (s?: string) => !!s && s.trim().length > 0
  const parts: string[] = []
  if (has(c.chiefComplaint)) parts.push(`a queixa principal registrada foi ${q(c.chiefComplaint)}`)
  if (has(c.reportedSymptoms)) parts.push(`o paciente relatou ${q(c.reportedSymptoms)}`)
  if (has(c.observedFindings)) parts.push(`o profissional observou ${q(c.observedFindings)}`)
  if (has(c.examResults)) parts.push(`foram registrados os resultados de exames ${q(c.examResults)}`)
  if (has(c.assessment)) parts.push(`na avaliação do profissional consta ${q(c.assessment)}`)
  if (has(c.diagnosticHypotheses)) parts.push(`como hipótese diagnóstica (não confirmada) consta ${q(c.diagnosticHypotheses)}`)
  if (has(c.confirmedDiagnosis)) parts.push(`o diagnóstico confirmado registrado é ${q(c.confirmedDiagnosis)}`)
  if (has(c.procedures)) parts.push(`foram registrados os procedimentos ${q(c.procedures)}`)
  const meds = (c.medications ?? []).filter((m) => has(m.name))
  if (meds.length) parts.push(`${meds.length === 1 ? 'consta o medicamento' : 'constam os medicamentos'} ${meds.map((m) => `${m.name.trim()}${[m.dose, m.route, m.frequency].filter(has).length ? ` (${[m.dose && `dose ${m.dose}`, m.route && `via ${m.route}`, m.frequency].filter(has).join(', ')})` : ''}, registrado como ${m.status === 'administrado' ? 'administrado' : 'prescrito'}`).join('; ')}`)
  if (has(c.conduct)) parts.push(`a conduta registrada foi ${q(c.conduct)}`)
  if (has(c.guidance)) parts.push(`as orientações registradas foram ${q(c.guidance)}`)
  if (has(c.followUpPlan)) parts.push(`o plano de acompanhamento registrado é ${q(c.followUpPlan)}`)
  if (!parts.length) return `Em ${formatDate(r.attendedAt)} [${recordCode(r.id)}] há um registro do tipo ${typeLabel} sem conteúdo textual relevante.`
  const [first, ...rest] = parts
  const body = rest.length ? `${first}; ${rest.slice(0, -1).join('; ')}${rest.length > 1 ? '; e ' : ''}${rest[rest.length - 1]}` : first
  return `Em ${formatDate(r.attendedAt)} [${recordCode(r.id)}] (${typeLabel}), ${body}.`
}

/** Dias entre dois instantes, pela data civil (fuso de Brasília). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((new Date(`${toIsoDate(b)}T12:00:00Z`).getTime() - new Date(`${toIsoDate(a)}T12:00:00Z`).getTime()) / 86400000)
}
