import type { ClinicalContent, ClinicalRecord, RecordType } from '@/types'
import { fromDateTimeInput } from '@/lib/date'

let seq = 0

/** Cria um registro fictício. `at` está em horário de Brasília (YYYY-MM-DDTHH:mm). */
export function makeRecord(
  at: string,
  content: ClinicalContent,
  opts: Omit<Partial<ClinicalRecord>, 'createdAt'> & { type?: RecordType; createdAt?: string } = {},
): ClinicalRecord {
  seq++
  const { createdAt, ...rest } = opts
  const attendedAt = fromDateTimeInput(at)
  return {
    id: `r${String(seq).padStart(5, '0')}abcdef`,
    patientId: 'pat1',
    type: 'evolucao',
    attendedAt,
    createdAt: createdAt ? fromDateTimeInput(createdAt) : attendedAt,
    authorUid: 'u1',
    authorName: 'Dra. Teste Fictícia',
    content,
    attachments: [],
    version: 1,
    status: 'finalizado',
    amendmentCount: 0,
    accessUids: ['u1'],
    searchTokens: [],
    ...rest,
  }
}

export const patient = {
  fullName: 'João da Silva (fictício)',
  birthDate: '1980-05-10',
  sex: 'masculino' as const,
  allergies: 'Dipirona',
  clinicalInfo: '',
}
