import { describe, expect, it } from 'vitest'
import { calcAge, formatDate, formatDateTime, formatIsoDate, fromDateTimeInput, isValidIsoDate, toDateTimeInput, toIsoDate } from '@/lib/date'
import { normalize, tokenize } from '@/lib/text'
import { canonicalReportPayload, sha256Hex } from '@/lib/reports/hash'

describe('datas (Brasil)', () => {
  it('formata em DD/MM/AAAA no fuso de Brasília', () => {
    const d = new Date('2026-10-02T01:30:00Z') // 01/10 22:30 em Brasília
    expect(formatDate(d)).toBe('01/10/2026')
    expect(formatDateTime(d)).toBe('01/10/2026 às 22:30')
    expect(toIsoDate(d)).toBe('2026-10-01')
  })
  it('converte datetime-local de/para Brasília', () => {
    const d = fromDateTimeInput('2026-10-01T09:15')
    expect(d.toISOString()).toBe('2026-10-01T12:15:00.000Z')
    expect(toDateTimeInput(d)).toBe('2026-10-01T09:15')
  })
  it('formata datas ISO sem deslocar o dia', () => {
    expect(formatIsoDate('2026-10-01')).toBe('01/10/2026')
    expect(formatIsoDate(undefined)).toBe('—')
  })
  it('calcula idade e valida datas', () => {
    expect(calcAge('2000-10-02', new Date('2026-10-01T15:00:00Z'))).toBe(25)
    expect(calcAge('2000-10-01', new Date('2026-10-01T15:00:00Z'))).toBe(26)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-02-28')).toBe(true)
  })
})

describe('texto', () => {
  it('normaliza acentos e caixa', () => {
    expect(normalize('  JOÃO   da Silva ')).toBe('joao da silva')
  })
  it('tokeniza sem stopwords', () => {
    const t = tokenize('Dor de cabeça e falta de ar')
    expect(t).toContain('cabeca')
    expect(t).toContain('falta')
    expect(t).not.toContain('de')
  })
})

describe('hash de relatório', () => {
  it('é estável e muda quando o conteúdo muda', async () => {
    const base = {
      number: 'REL-1',
      version: 1,
      patientId: 'p',
      title: 't',
      sections: [{ id: 's1', title: 'a', body: 'b', refs: [] }],
      professionalNotes: '',
      sourceRecordIds: ['2', '1'],
      origin: 'local' as const,
    }
    const h1 = await sha256Hex(canonicalReportPayload(base))
    const h2 = await sha256Hex(canonicalReportPayload({ ...base, sourceRecordIds: ['1', '2'] }))
    const h3 = await sha256Hex(canonicalReportPayload({ ...base, sections: [{ id: 's1', title: 'a', body: 'b!', refs: [] }] }))
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1).toHaveLength(64)
  })
})
