import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { DetailLevel, RecordType, ReportKind, ReportSection } from '@/types'

export interface AiReportRequest {
  patientId: string
  kind: ReportKind
  detail: DetailLevel
  periodFrom?: string
  periodTo?: string
  types?: RecordType[]
}

export interface AiReportResponse {
  title: string
  sections: ReportSection[]
  warnings: string[]
  sourceRecordIds: string[]
  model: string
}

/**
 * Chama a Cloud Function `generateAiReport`. A função (no servidor) confere as permissões,
 * lê os registros, remove identificadores diretos e só então consulta o modelo de linguagem.
 * A chave da API fica exclusivamente no Secret Manager do Firebase.
 */
export async function generateAiReport(req: AiReportRequest): Promise<AiReportResponse> {
  const fn = httpsCallable<AiReportRequest, AiReportResponse>(functions, 'generateAiReport', { timeout: 120_000 })
  const res = await fn(req)
  return res.data
}
