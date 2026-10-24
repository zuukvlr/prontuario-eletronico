import type { ClinicalRecord, ReportSection } from '@/types'
import { formatDate } from '@/lib/date'
import { normalize, recordCode } from '@/lib/text'

/**
 * Verificação automática do texto escrito por IA contra os registros. Não prova que o texto está correto:
 * apenas acusa o que o modelo disse e NÃO consta nos registros (números, datas, medicamentos, causalidade,
 * diagnóstico confirmado, administração) e registros esquecidos. Tudo vira ponto de atenção para o profissional.
 */

export interface AiSection {
  title?: string
  body?: string
  refs?: string[]
}

export interface AiOutput {
  sections?: AiSection[]
  warnings?: string[]
}

export interface VerifyResult {
  sections: ReportSection[]
  issues: string[]
  /** true quando há problema grave (dado ausente nos registros) — o relatório deve ser tratado com cautela. */
  severe: boolean
}

const CAUSAL = ['devido a', 'devido ao', 'causado por', 'causada por', 'por causa d', 'em decorrencia', 'resultou em', 'provocado por', 'consequencia d', 'em razao d']
const DRUG_SUFFIX = /\b[a-zà-ÿ]{4,}(cilina|micina|micina|prazol|olol|pril|sartana|dipina|statina|formina|azol|floxacino|cefal[a-z]*|cortizona|sona|zepam|triptilina|tidina|dronato|parina|xabana)\b/gi

function sourceText(records: ClinicalRecord[]): string {
  return normalize(
    records
      .map((r) => JSON.stringify(r.content) + ' ' + r.attachments.map((a) => a.name).join(' '))
      .join(' ')
      .replace(/[“”"]/g, ' '),
  )
}

/** Extrai o JSON da resposta do modelo (tolera texto antes/depois e cercas de markdown). */
export function parseAiJson(text: string): AiOutput | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as AiOutput
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

export function verifyAiOutput(out: AiOutput, records: ClinicalRecord[]): VerifyResult {
  const issues: string[] = []
  let severe = false
  const byCode = new Map(records.map((r) => [recordCode(r.id), r]))
  const src = sourceText(records)
  const validDates = new Set(records.flatMap((r) => [formatDate(r.attendedAt), ...(r.content.returnDate ? [formatDate(new Date(`${r.content.returnDate}T12:00:00-03:00`))] : [])]))
  const hasConfirmed = records.some((r) => (r.content.confirmedDiagnosis ?? '').trim())
  const hasAdministered = records.some((r) => (r.content.medications ?? []).some((m) => m.status === 'administrado'))

  const sections: ReportSection[] = []
  const cited = new Set<string>()
  ;(out.sections ?? []).forEach((s, i) => {
    const body = String(s.body ?? '').trim()
    const title = String(s.title ?? '').trim()
    if (!body || !title) return
    const text = normalize(body)
    const refs: string[] = []
    for (const c of [...(s.refs ?? []), ...(body.match(/REG-[A-Z0-9]{6}/gi) ?? [])]) {
      const code = String(c).toUpperCase()
      const rec = byCode.get(code)
      if (rec) {
        if (!refs.includes(rec.id)) refs.push(rec.id)
        cited.add(rec.id)
      } else if (!issues.some((x) => x.includes(code))) {
        issues.push(`Código de registro inexistente citado pela IA: ${code} (seção "${title}").`)
        severe = true
      }
    }
    for (const d of body.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? []) {
      if (!validDates.has(d)) {
        issues.push(`Data ${d} aparece no texto da IA (seção "${title}") mas não corresponde a nenhum registro.`)
        severe = true
      }
    }
    for (const n of body.match(/\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ml|mL|g|ui|UI|%|mmhg|mmHg|°C|ºC|kg|bpm|irpm|mg\/dl|mg\/dL)\b/g) ?? []) {
      const key = normalize(n).replace(/\s/g, '').replace(',', '.')
      const hay = src.replace(/\s/g, '').replace(/,/g, '.')
      if (!hay.includes(key)) {
        issues.push(`Valor "${n}" aparece no texto da IA (seção "${title}") mas não foi encontrado nos registros.`)
        severe = true
      }
    }
    for (const pair of body.match(/\b\d{2,3}\s?[x/]\s?\d{2,3}\b(?!\/\d)/gi) ?? []) {
      const key = pair.replace(/\s/g, '').replace('/', 'x').toLowerCase()
      if (!src.replace(/\s/g, '').replace(/(\d)\/(\d)/g, '$1x$2').includes(key)) {
        issues.push(`Valor "${pair}" (pressão arterial ou razão) aparece no texto da IA (seção "${title}") mas não foi encontrado nos registros.`)
        severe = true
      }
    }
    for (const w of body.match(DRUG_SUFFIX) ?? []) {
      if (!src.includes(normalize(w))) {
        issues.push(`Termo "${w}" parece ser um medicamento e não consta nos registros (seção "${title}").`)
        severe = true
      }
    }
    for (const c of CAUSAL) {
      if (text.includes(c) && !src.includes(c)) {
        issues.push(`A IA usou expressão de causa e efeito ("${c.trim()}") que não consta nos registros (seção "${title}"). Verificar.`)
      }
    }
    if (!hasConfirmed && /(diagnosticad[oa] com|diagnostico confirmado|confirmou o diagnostico|foi confirmad)/.test(text)) {
      issues.push(`A IA fala em diagnóstico confirmado, mas nenhum registro tem diagnóstico confirmado (seção "${title}").`)
      severe = true
    }
    if (!hasAdministered && /\badministrad[oa]s?\b/.test(text)) {
      issues.push(`A IA menciona medicação administrada, mas os registros só indicam prescrição (seção "${title}").`)
      severe = true
    }
    sections.push({ id: `ai${i + 1}`, title: title.slice(0, 200), body: body.slice(0, 30_000), refs })
  })

  // Cobertura: nenhum registro pode ficar de fora da síntese
  const aiText = sections.map((s) => s.body).join(' ')
  for (const r of records) {
    if (!cited.has(r.id) && !aiText.includes(recordCode(r.id))) {
      issues.push(`O registro ${recordCode(r.id)} (${formatDate(r.attendedAt)}) não foi citado pela IA. Nenhum acontecimento pode ser omitido: confira o registro original.`)
    }
  }
  if (!sections.length) {
    issues.push('A IA não devolveu seções utilizáveis.')
    severe = true
  }
  return { sections, issues, severe }
}
