import { describe, expect, it } from 'vitest'
import { buildReport } from '@/lib/reports/builder'
import { recordCode } from '@/lib/text'
import { makeRecord, patient } from './fixtures'

const day1 = makeRecord('2026-10-01T09:00', {
  chiefComplaint: 'Dificuldade para respirar',
  reportedSymptoms: 'Falta de ar aos esforços há 2 dias',
  observedFindings: 'Sibilos discretos',
  assessment: 'Quadro compatível com crise respiratória leve',
  diagnosticHypotheses: 'Asma',
  conduct: 'Nebulização realizada',
})
const day2 = makeRecord('2026-10-02T10:00', {
  chiefComplaint: 'Retorno',
  reportedSymptoms: 'Melhora parcial',
  evolution: 'Melhora em relação ao atendimento anterior',
  assessment: 'Mantém acompanhamento',
  conduct: 'Manter orientações',
})
const day3 = makeRecord('2026-10-03T08:30', {
  chiefComplaint: 'Mancha no rosto',
  observedFindings: 'Mácula eritematosa em região malar direita, 2 cm',
  assessment: 'Lesão a esclarecer',
  guidance: 'Evitar exposição solar',
  conduct: 'Observação clínica',
})
const day4 = makeRecord(
  '2026-10-04T11:00',
  {
    assessment: 'Início de tratamento',
    medications: [{ name: 'Amoxicilina', dose: '500 mg', route: 'VO', frequency: '8/8h', status: 'prescrito' }],
    conduct: 'Prescrição emitida',
    returnDate: '2026-10-11',
  },
  { type: 'prescricao' },
)

const base = { patient, kind: 'completo' as const, detail: 'padrao' as const, now: new Date('2026-10-05T12:00:00Z') }

describe('buildReport', () => {
  it('ordena cronologicamente independentemente da ordem de entrada', () => {
    const out = buildReport({ ...base, records: [day4, day2, day3, day1] })
    expect(out.sourceRecordIds).toEqual([day1.id, day2.id, day3.id, day4.id])
    const text = out.sections.find((s) => s.title === 'Histórico e evolução clínica')!.body
    expect(text.indexOf('01/10/2026')).toBeLessThan(text.indexOf('02/10/2026'))
    expect(text.indexOf('03/10/2026')).toBeLessThan(text.indexOf('04/10/2026'))
  })

  it('preserva múltiplos registros no mesmo dia', () => {
    const a = makeRecord('2026-10-01T09:00', { chiefComplaint: 'Manhã', assessment: 'A', conduct: 'c' })
    const b = makeRecord('2026-10-01T15:00', { chiefComplaint: 'Tarde', assessment: 'B', conduct: 'c' })
    const out = buildReport({ ...base, records: [b, a] })
    expect(out.sourceRecordIds).toEqual([a.id, b.id])
    const body = out.sections.find((s) => s.title === 'Histórico e evolução clínica')!.body
    expect(body).toContain('Manhã')
    expect(body).toContain('Tarde')
  })

  it('referencia o registro original e não inventa medicação administrada', () => {
    const out = buildReport({ ...base, records: [day1, day4] })
    const all = out.sections.map((s) => s.body).join('\n')
    expect(all).toContain(recordCode(day4.id))
    expect(all).toContain('PRESCRITO')
    expect(all).not.toContain('ADMINISTRADO')
    expect(out.warnings.some((w) => w.includes('apenas como prescrito'))).toBe(true)
  })

  it('não transforma hipótese em diagnóstico confirmado', () => {
    const out = buildReport({ ...base, records: [day1] })
    const all = out.sections.map((s) => s.body).join('\n')
    expect(all).toContain('Hipóteses diagnósticas (não confirmadas): Asma')
    expect(all).toContain('Não há diagnóstico confirmado registrado no período')
  })

  it('filtra por período', () => {
    const out = buildReport({ ...base, records: [day1, day2, day3, day4], periodFrom: '2026-10-02', periodTo: '2026-10-03' })
    expect(out.sourceRecordIds).toEqual([day2.id, day3.id])
  })

  it('filtra por tipo de registro', () => {
    const out = buildReport({ ...base, kind: 'por_tipo', types: ['prescricao'], records: [day1, day4] })
    expect(out.sourceRecordIds).toEqual([day4.id])
  })

  it('informa falta de dados quando não há registros', () => {
    const out = buildReport({ ...base, records: [] })
    expect(out.sourceRecordIds).toEqual([])
    expect(out.warnings[0]).toMatch(/não há dados suficientes/i)
  })

  it('exclui rascunhos e avisa', () => {
    const draft = makeRecord('2026-10-06T09:00', { chiefComplaint: 'x' }, { status: 'rascunho' })
    const out = buildReport({ ...base, records: [day1, draft] })
    expect(out.sourceRecordIds).toEqual([day1.id])
    expect(out.warnings.some((w) => w.includes('rascunho'))).toBe(true)
  })

  it('detecta informações ausentes e contraditórias', () => {
    const a = makeRecord('2026-10-01T09:00', {
      confirmedDiagnosis: 'Pneumonia',
      medications: [{ name: 'Azitromicina', dose: '500 mg', status: 'prescrito' }],
      requestedExams: 'Raio-X de tórax',
    })
    const b = makeRecord('2026-10-03T09:00', {
      confirmedDiagnosis: 'Bronquite',
      assessment: 'x',
      conduct: 'y',
      medications: [{ name: 'Azitromicina', dose: '250 mg', route: 'VO', frequency: '24/24h', status: 'prescrito' }],
    })
    const out = buildReport({ ...base, records: [a, b] })
    const w = out.warnings.join('\n')
    expect(w).toMatch(/mais de um diagnóstico confirmado distinto/)
    expect(w).toMatch(/doses diferentes/)
    expect(w).toMatch(/sem via, frequência/)
    expect(w).toMatch(/sem resultado localizado/)
    expect(w).toMatch(/evolução clínica sem conduta/)
  })

  it('alerta quando medicamento cita alergia cadastrada', () => {
    const r = makeRecord('2026-10-01T09:00', { medications: [{ name: 'Dipirona 500mg', dose: '1 cp', route: 'VO', frequency: '6/6h', status: 'prescrito' }] })
    const out = buildReport({ ...base, records: [r] })
    expect(out.warnings.some((x) => x.startsWith('ATENÇÃO'))).toBe(true)
  })

  it('mostra a data de inserção quando difere da data do atendimento', () => {
    const r = makeRecord('2026-10-01T09:00', { chiefComplaint: 'Tosse' }, { createdAt: '2026-10-05T18:00' })
    const out = buildReport({ ...base, records: [r] })
    expect(out.sections.map((s) => s.body).join('\n')).toContain('registro inserido no sistema em 05/10/2026')
  })

  it('inclui adendos preservando o valor original', () => {
    const out = buildReport({
      ...base,
      records: [day1],
      amendments: {
        [day1.id]: [
          {
            id: 'a1',
            recordId: day1.id,
            kind: 'retificacao',
            reason: 'Erro de digitação',
            text: 'Falta de ar há 3 dias',
            field: 'reportedSymptoms',
            previousValue: 'Falta de ar aos esforços há 2 dias',
            authorUid: 'u1',
            authorName: 'Dra. Teste Fictícia',
            createdAt: new Date('2026-10-02T12:00:00Z'),
          },
        ],
      },
    })
    const body = out.sections.map((s) => s.body).join('\n')
    expect(body).toContain('Valor original preservado: "Falta de ar aos esforços há 2 dias"')
    expect(body).toContain('Valor retificado: "Falta de ar há 3 dias"')
  })

  it('gera relatório de medicamentos, exames, linha do tempo e encaminhamento', () => {
    const exam = makeRecord('2026-10-02T09:00', { requestedExams: 'Hemograma', examResults: 'Leucócitos 11.000/mm³' }, { type: 'exame' })
    for (const kind of ['medicamentos', 'exames', 'linha_do_tempo', 'encaminhamento', 'resumo'] as const) {
      const out = buildReport({ ...base, kind, records: [day1, exam, day4] })
      expect(out.sections.length).toBeGreaterThan(1)
      expect(out.title.length).toBeGreaterThan(5)
    }
    const ex = buildReport({ ...base, kind: 'exames', records: [day1, exam, day4] })
    expect(ex.sourceRecordIds).toEqual([exam.id])
  })

  it('níveis de detalhe alteram a quantidade de conteúdo', () => {
    const small = buildReport({ ...base, detail: 'resumido', records: [day1] }).sections[1].body
    const big = buildReport({ ...base, detail: 'detalhado', records: [day1] }).sections[1].body
    expect(big.length).toBeGreaterThan(small.length)
    expect(small).not.toContain('Sibilos')
    expect(big).toContain('Sibilos')
  })
})
