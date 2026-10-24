import type { ClinicalRecord, Patient } from '@/types'
import { formatDate, formatTime } from '@/lib/date'
import { recordCode } from '@/lib/text'
import { FIELD_LABEL } from '@/lib/recordTypes'

/**
 * Minimização de dados antes de enviar texto a qualquer modelo (local ou remoto): remove o nome do
 * paciente e padrões de CPF, telefone e e-mail. É uma heurística, não uma garantia de anonimização.
 */
export function makeScrubber(fullName: string): (s: string) => string {
  const parts = fullName
    .split(/\s+/)
    .map((p) => p.replace(/[()]/g, ''))
    .filter((p) => p.length >= 3)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = parts.length ? new RegExp(`(?<![\\p{L}])(${parts.join('|')})(?![\\p{L}])`, 'giu') : null
  return (s) =>
    (re ? s.replace(re, '[PACIENTE]') : s)
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[DOC]')
      .replace(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[TEL]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]')
}

const SEND_LABEL: Partial<Record<keyof ClinicalRecord['content'], string>> = {
  ...FIELD_LABEL,
  reportedSymptoms: 'Sintomas RELATADOS PELO PACIENTE',
  observedFindings: 'Achados OBSERVADOS PELO PROFISSIONAL',
  diagnosticHypotheses: 'Hipóteses diagnósticas (NÃO confirmadas)',
  confirmedDiagnosis: 'Diagnóstico CONFIRMADO',
  examResults: 'RESULTADOS DE EXAMES',
}
const ORDER = ['title', 'chiefComplaint', 'reportedSymptoms', 'observedFindings', 'evolution', 'assessment', 'diagnosticHypotheses', 'confirmedDiagnosis', 'procedures', 'requestedExams', 'examResults', 'conduct', 'guidance', 'followUpPlan', 'returnDate', 'additionalNotes'] as const

/** Serializa registros para o modelo: códigos REG-XXXXXX no lugar de IDs, sem autor e sem nome do paciente. */
export function serializeRecords(records: ClinicalRecord[], patient: Pick<Patient, 'fullName' | 'allergies'>, maxChars = 60_000): { text: string; included: ClinicalRecord[] } {
  const scrub = makeScrubber(patient.fullName)
  const blocks: string[] = []
  const included: ClinicalRecord[] = []
  let budget = maxChars
  for (const r of records) {
    const lines = [`### ${recordCode(r.id)} | ${formatDate(r.attendedAt)} ${formatTime(r.attendedAt)} | tipo: ${r.type}`]
    for (const f of ORDER) {
      const v = r.content[f]
      if (typeof v === 'string' && v.trim()) lines.push(`${SEND_LABEL[f] ?? f}: ${scrub(v.trim())}`)
    }
    for (const m of r.content.medications ?? []) {
      lines.push(`Medicamento [${m.status === 'administrado' ? 'ADMINISTRADO' : 'PRESCRITO'}]: ${scrub([m.name, m.dose && `dose ${m.dose}`, m.route && `via ${m.route}`, m.frequency].filter(Boolean).join(', '))}`)
    }
    const block = lines.join('\n')
    if (budget - block.length < 0) break
    budget -= block.length
    blocks.push(block)
    included.push(r)
  }
  return { text: blocks.join('\n\n'), included }
}
