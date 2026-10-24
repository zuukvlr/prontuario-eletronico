import { describe, expect, it } from 'vitest'
import { buildPdf, pdfSafe, pdfFileName } from '@/lib/reports/pdf'
import { buildReport } from '@/lib/reports/builder'
import type { GeneratedReport } from '@/types'
import { makeRecord, patient } from './fixtures'

function reportFrom(n: number, status: 'rascunho' | 'final'): GeneratedReport {
  const records = Array.from({ length: n }, (_, i) =>
    makeRecord(`2026-10-${String((i % 28) + 1).padStart(2, '0')}T09:00`, {
      chiefComplaint: `Queixa número ${i + 1} com acentuação: coração, ação, pulmão — “aspas” • marcador`,
      assessment: 'Avaliação '.repeat(40),
      conduct: 'Conduta registrada',
    }),
  )
  const out = buildReport({ patient, records, kind: 'completo', detail: 'detalhado' })
  return {
    id: 'rep1',
    groupId: 'rep1',
    version: 2,
    number: 'REL-20261005-ABCDE',
    patientId: 'p1',
    patientName: patient.fullName,
    patientCode: 'PAC-000001',
    kind: 'completo',
    title: out.title,
    recordTypes: [],
    detail: 'detalhado',
    origin: 'local',
    sections: out.sections,
    warnings: out.warnings,
    professionalNotes: 'Observação do profissional.',
    sourceRecordIds: out.sourceRecordIds,
    status,
    generatedByUid: 'u1',
    generatedByName: 'Dra. Teste Fictícia',
    createdAt: new Date('2026-10-05T12:00:00Z'),
    finalizedAt: status === 'final' ? new Date('2026-10-05T13:00:00Z') : undefined,
    finalizedByName: status === 'final' ? 'Dra. Teste Fictícia' : undefined,
    contentHash: status === 'final' ? 'a'.repeat(64) : undefined,
    accessUids: ['u1'],
  }
}

describe('PDF', () => {
  it('gera PDF paginado com várias páginas para históricos longos', () => {
    const doc = buildPdf(reportFrom(40, 'final'), { clinicName: 'Clínica Teste' })
    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    const bytes = doc.output('arraybuffer')
    expect(bytes.byteLength).toBeGreaterThan(5000)
    expect(new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5))).toBe('%PDF-')
  })
  it('gera PDF de rascunho sem erro e nomeia o arquivo com número e versão', () => {
    const r = reportFrom(2, 'rascunho')
    expect(buildPdf(r, { clinicName: 'Clínica Teste' }).getNumberOfPages()).toBeGreaterThanOrEqual(1)
    expect(pdfFileName(r)).toBe('REL-20261005-ABCDE-v2.pdf')
  })
  it('substitui caracteres fora da codificação do PDF', () => {
    expect(pdfSafe('a → b ↳ c ≥ d “ok”')).toBe('a ? b » c >= d “ok”')
  })
})
