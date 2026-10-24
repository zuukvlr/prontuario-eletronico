import { describe, expect, it } from 'vitest'
import { buildReport } from '@/lib/reports/builder'
import { extractVitals, glossarySection, proseParagraph, symptomPersistence, vitalsSection } from '@/lib/reports/clinical'
import { makeScrubber, serializeRecords } from '@/lib/ai/deidentify'
import { parseAiJson, verifyAiOutput } from '@/lib/ai/verify'
import { composeAiReport } from '@/lib/ai/compose'
import { isLocalUrl } from '@/services/ollamaService'
import { recordCode } from '@/lib/text'
import { makeRecord, patient } from './fixtures'

const r1 = makeRecord('2026-10-01T09:00', {
  chiefComplaint: 'Falta de ar',
  reportedSymptoms: 'Falta de ar e tosse seca há 2 dias',
  observedFindings: 'PA 130x80, FC 98 bpm, SpO2 94%, T 37,8 °C. Sibilos.',
  assessment: 'Quadro respiratório a acompanhar',
  conduct: 'Nebulização',
})
const r2 = makeRecord('2026-10-03T10:00', {
  chiefComplaint: 'Retorno',
  reportedSymptoms: 'Tosse seca persiste',
  observedFindings: 'PA 120/80, SpO2 97%',
  assessment: 'Mantém acompanhamento',
  conduct: 'Manter orientações',
  medications: [{ name: 'Amoxicilina', dose: '500 mg', route: 'VO', frequency: '8/8h', status: 'prescrito' }],
})

describe('reconhecimento de termos clínicos', () => {
  it('extrai sinais vitais do texto, em ordem cronológica', () => {
    const v = extractVitals([r1, r2])
    expect(v.filter((x) => x.key === 'pa').map((x) => x.value)).toEqual(['130x80 mmHg', '120x80 mmHg'])
    expect(v.find((x) => x.key === 'spo2')?.value).toBe('94%')
    expect(v.find((x) => x.key === 'temp')?.value).toBe('37,8 °C')
    const sec = vitalsSection([r1, r2])!
    expect(sec.body).toContain('sem interpretação de normalidade')
  })
  it('lista termos recorrentes sem concluir resolução', () => {
    const sec = symptomPersistence([r1, r2])!
    expect(sec.body).toContain('"tosse": citado em 2 registros')
    expect(sec.body).not.toMatch(/resolvid|curad/i)
  })
  it('glossário só para siglas em maiúsculas', () => {
    const sec = glossarySection([r1, r2])!
    expect(sec.body).toContain('PA: pressão arterial')
    expect(sec.body).toContain('VO: via oral')
  })
  it('gera texto corrido citando o registro literalmente', () => {
    const p = proseParagraph(r2, 'Evolução clínica')
    expect(p).toContain(recordCode(r2.id))
    expect(p).toContain('registrado como prescrito')
    expect(p).not.toContain('administrado')
  })
  it('novos alertas: frequência divergente, retorno anterior ao atendimento, duplicidade', () => {
    const a = makeRecord('2026-10-05T09:00', { medications: [{ name: 'Dipirona', dose: '1 g', route: 'VO', frequency: '6/6h', status: 'prescrito' }], returnDate: '2026-10-01', chiefComplaint: 'x', assessment: 'a', conduct: 'c' })
    const b = makeRecord('2026-10-06T09:00', { medications: [{ name: 'Dipirona', dose: '1 g', route: 'VO', frequency: '8/8h', status: 'prescrito' }], chiefComplaint: 'x', assessment: 'a', conduct: 'c' })
    const d1 = makeRecord('2026-10-07T09:00', { additionalNotes: 'igual' }, { type: 'observacao' })
    const d2 = makeRecord('2026-10-07T15:00', { additionalNotes: 'igual' }, { type: 'observacao' })
    const w = buildReport({ patient: { ...patient, allergies: '' }, records: [a, b, d1, d2], kind: 'completo', detail: 'padrao' }).warnings.join('\n')
    expect(w).toMatch(/frequências diferentes/)
    expect(w).toMatch(/anterior à data do atendimento/)
    expect(w).toMatch(/conteúdo idêntico no mesmo dia/)
  })
  it('relatório completo inclui narrativa, recorrência, dados objetivos e glossário', () => {
    const titles = buildReport({ patient, records: [r1, r2], kind: 'completo', detail: 'padrao' }).sections.map((s) => s.title)
    expect(titles).toEqual(expect.arrayContaining(['Narrativa cronológica em texto corrido', 'Termos recorrentes nas queixas e sintomas', 'Dados objetivos citados nos registros', 'Glossário de abreviações encontradas']))
  })
})

describe('minimização de dados', () => {
  it('remove nome, CPF, telefone e e-mail antes do envio à IA', () => {
    const scrub = makeScrubber('João da Silva (fictício)')
    const out = scrub('João relatou dor. CPF 123.456.789-09, tel (11) 91234-5678, joao@x.com. Silva')
    expect(out).not.toMatch(/João|Silva|123\.456|91234|joao@/)
    expect(out).toContain('[PACIENTE]')
  })
  it('serializa com códigos REG, sem autor e sem nome', () => {
    const { text, included } = serializeRecords([r1], patient)
    expect(included).toHaveLength(1)
    expect(text).toContain(recordCode(r1.id))
    expect(text).not.toContain('Dra. Teste')
    expect(text).not.toContain('João')
  })
  it('só aceita endereço local para o Ollama', () => {
    expect(isLocalUrl('http://localhost:11434')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:11434')).toBe(true)
    expect(isLocalUrl('https://meu-servidor.com')).toBe(false)
    expect(isLocalUrl('http://192.168.0.10:11434')).toBe(false)
  })
})

describe('verificação automática da IA', () => {
  const c1 = recordCode(r1.id)
  const c2 = recordCode(r2.id)
  const good = {
    sections: [
      { title: 'Histórico', body: `Em 01/10/2026 [${c1}] o paciente relatou falta de ar; PA 130x80 mmHg. Em 03/10/2026 [${c2}] houve retorno e a prescrição de Amoxicilina 500 mg.`, refs: [c1, c2] },
    ],
  }
  it('aceita texto fiel aos registros', () => {
    const v = verifyAiOutput(good, [r1, r2])
    expect(v.issues).toEqual([])
    expect(v.severe).toBe(false)
    expect(v.sections[0].refs).toEqual([r1.id, r2.id])
  })
  it('acusa dado inventado: data, valor, medicamento, causa, diagnóstico e administração', () => {
    const bad = {
      sections: [
        {
          title: 'Histórico',
          body: `Em 15/09/2026 [${c1}] o paciente, diagnosticado com pneumonia, teve piora devido a frio; tomou Azitromicina 250 mg administrada no local; PA 200x100 mmHg. [REG-ZZZZZZ]`,
          refs: [c1],
        },
      ],
    }
    const v = verifyAiOutput(bad, [r1, r2])
    const all = v.issues.join('\n')
    expect(all).toMatch(/15\/09\/2026/)
    expect(all).toMatch(/250 mg/)
    expect(all).toMatch(/200x100/)
    expect(all).toMatch(/Azitromicina/)
    expect(all).toMatch(/causa e efeito/)
    expect(all).toMatch(/diagnóstico confirmado/)
    expect(all).toMatch(/administrada/)
    expect(all).toMatch(/REG-ZZZZZZ/)
    expect(v.severe).toBe(true)
  })
  it('acusa registro esquecido', () => {
    const v = verifyAiOutput({ sections: [{ title: 'Histórico', body: `Em 01/10/2026 [${c1}] falta de ar.`, refs: [c1] }] }, [r1, r2])
    expect(v.issues.some((i) => i.includes(c2) && i.includes('não foi citado'))).toBe(true)
  })
  it('lê JSON com texto em volta e rejeita lixo', () => {
    expect(parseAiJson('```json\n{"sections":[{"title":"a","body":"b"}]}\n```')?.sections).toHaveLength(1)
    expect(parseAiJson('sem json')).toBeNull()
    expect(parseAiJson('{quebrado')).toBeNull()
  })
  it('composição mantém escopo e pontos de atenção do motor e adiciona a verificação', () => {
    const built = buildReport({ patient, records: [r1, r2], kind: 'completo', detail: 'padrao' })
    const { sections, warnings } = composeAiReport(built, verifyAiOutput(good, [r1, r2]))
    expect(sections[0].title).toBe('Escopo e base de dados')
    expect(sections.some((s) => s.title.startsWith('Verificação automática'))).toBe(true)
    expect(sections[sections.length - 1].title).toMatch(/Informações ausentes/)
    expect(warnings[0]).toMatch(/auxílio de IA/)
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length)
  })
})
