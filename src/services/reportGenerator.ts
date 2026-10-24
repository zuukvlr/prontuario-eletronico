import { buildReport } from '@/lib/reports/builder'
import { buildUserPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt'
import { serializeRecords } from '@/lib/ai/deidentify'
import { parseAiJson, verifyAiOutput } from '@/lib/ai/verify'
import { composeAiReport } from '@/lib/ai/compose'
import { calcAge } from '@/lib/date'
import { generateAiReport } from './aiService'
import { chatJson, loadOllamaConfig } from './ollamaService'
import { createReportDraft } from './reportService'
import { listAllPatientRecords, listAmendments } from './recordService'
import { AppError } from '@/lib/errors'
import type { Amendment, DetailLevel, GeneratedReport, Patient, RecordType, ReportKind, UserProfile } from '@/types'

export type GenerationMode = 'padrao' | 'ia_local' | 'ia_nuvem'

export interface GenerateParams {
  patient: Patient
  kind: ReportKind
  detail: DetailLevel
  periodFrom?: string
  periodTo?: string
  types: RecordType[]
  mode: GenerationMode
}

/**
 * Orquestra a geração: carrega os registros autorizados (as regras do Firestore já barram leituras indevidas),
 * consolida com o motor determinístico e, se pedido, pede a narrativa a uma IA (local ou em nuvem).
 * O texto da IA SEMPRE passa pela verificação automática e o resultado é salvo como RASCUNHO.
 */
export async function generateReport(actor: UserProfile, p: GenerateParams, previous?: GeneratedReport): Promise<string> {
  const records = await listAllPatientRecords(actor, p.patient.id)
  const amendments: Record<string, Amendment[]> = {}
  await Promise.all(
    records
      .filter((r) => r.amendmentCount > 0)
      .map(async (r) => {
        amendments[r.id] = await listAmendments(r.id)
      }),
  )
  const types = p.types.length ? p.types : undefined
  const built = buildReport({ patient: p.patient, records, amendments, kind: p.kind, detail: p.detail, periodFrom: p.periodFrom, periodTo: p.periodTo, types })
  const base = { patient: p.patient, kind: p.kind, periodFrom: p.periodFrom, periodTo: p.periodTo, recordTypes: p.types, detail: p.detail }

  if (p.mode === 'padrao' || built.included.length === 0) {
    return createReportDraft(actor, { ...base, title: built.title, origin: 'local', sections: built.sections, warnings: built.warnings, sourceRecordIds: built.sourceRecordIds }, previous)
  }

  let rawText: string
  let model: string
  if (p.mode === 'ia_local') {
    const cfg = loadOllamaConfig()
    const { text, included } = serializeRecords(built.included, p.patient)
    if (included.length < built.included.length) built.warnings.push(`Apenas ${included.length} de ${built.included.length} registros couberam no limite da IA; o restante não foi analisado por ela.`)
    rawText = await chatJson(cfg, SYSTEM_PROMPT, buildUserPrompt(p.kind, p.detail, calcAge(p.patient.birthDate), p.patient.allergies, text, included.length))
    model = `ollama:${cfg.model}`
  } else {
    const ai = await generateAiReport({ patientId: p.patient.id, kind: p.kind, detail: p.detail, periodFrom: p.periodFrom, periodTo: p.periodTo, types })
    rawText = JSON.stringify({ sections: ai.sections })
    model = ai.model
  }

  const parsed = parseAiJson(rawText)
  if (!parsed) throw new AppError('A IA devolveu uma resposta em formato inesperado. Tente novamente ou use a consolidação sem IA.')
  const verified = verifyAiOutput(parsed, built.included)
  const { sections, warnings } = composeAiReport(built, verified)
  return createReportDraft(actor, { ...base, title: built.title, origin: 'ia', aiModel: model, sections, warnings, sourceRecordIds: built.sourceRecordIds }, previous)
}
