import type {
  Amendment,
  ClinicalContent,
  ClinicalRecord,
  ContentField,
  DetailLevel,
  Medication,
  Patient,
  RecordType,
  ReportKind,
  ReportSection,
} from '@/types'
import { calcAge, formatDate, formatDateTime, formatIsoDate, toIsoDate } from '@/lib/date'
import { FIELD_LABEL, RECORD_TYPE_LABEL } from '@/lib/recordTypes'
import { normalize, recordCode } from '@/lib/text'
import { glossarySection, proseParagraph, symptomPersistence, vitalsSection } from '@/lib/reports/clinical'

/**
 * Gerador DETERMINÍSTICO de relatórios consolidados.
 * Não usa IA: apenas reorganiza, em ordem cronológica, o que está efetivamente registrado,
 * preservando a referência (REG-XXXXXX) do registro de origem e separando relato do paciente,
 * observação do profissional e resultados de exames. Nunca infere diagnósticos, causas ou
 * administração de medicamentos que não constem no prontuário.
 */

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  completo: 'Relatório completo do histórico',
  resumo: 'Resumo da evolução clínica',
  periodo: 'Relatório de um período específico',
  por_tipo: 'Relatório por tipo de registro',
  medicamentos: 'Relatório de medicamentos e condutas documentadas',
  exames: 'Relatório de exames e resultados',
  linha_do_tempo: 'Linha do tempo dos acontecimentos',
  encaminhamento: 'Relatório para acompanhamento ou encaminhamento',
}

export const DETAIL_LABEL: Record<DetailLevel, string> = {
  resumido: 'Resumido',
  padrao: 'Padrão',
  detalhado: 'Detalhado',
}

export interface BuildInput {
  patient: Pick<Patient, 'fullName' | 'birthDate' | 'sex' | 'allergies' | 'clinicalInfo'>
  records: ClinicalRecord[]
  amendments?: Record<string, Amendment[]>
  kind: ReportKind
  detail: DetailLevel
  periodFrom?: string
  periodTo?: string
  types?: RecordType[]
  now?: Date
}

export interface BuildOutput {
  title: string
  sections: ReportSection[]
  warnings: string[]
  sourceRecordIds: string[]
  included: ClinicalRecord[]
}

const FIELDS_BY_DETAIL: Record<DetailLevel, ContentField[]> = {
  resumido: ['chiefComplaint', 'assessment', 'confirmedDiagnosis', 'conduct'],
  padrao: [
    'chiefComplaint',
    'reportedSymptoms',
    'observedFindings',
    'evolution',
    'assessment',
    'diagnosticHypotheses',
    'confirmedDiagnosis',
    'procedures',
    'examResults',
    'conduct',
    'guidance',
    'followUpPlan',
  ],
  detalhado: [
    'title',
    'chiefComplaint',
    'reportedSymptoms',
    'observedFindings',
    'evolution',
    'assessment',
    'diagnosticHypotheses',
    'confirmedDiagnosis',
    'procedures',
    'requestedExams',
    'examResults',
    'conduct',
    'guidance',
    'followUpPlan',
    'returnDate',
    'additionalNotes',
  ],
}

/** Rótulos que deixam clara a origem da informação (paciente x profissional x exame). */
const NARRATIVE_LABEL: Partial<Record<ContentField, string>> = {
  title: 'Título do documento',
  chiefComplaint: 'Queixa principal registrada',
  reportedSymptoms: 'Sintomas relatados pelo paciente',
  observedFindings: 'Achados observados pelo profissional',
  evolution: 'Evolução descrita no registro',
  assessment: 'Avaliação do profissional',
  diagnosticHypotheses: 'Hipóteses diagnósticas (não confirmadas)',
  confirmedDiagnosis: 'Diagnóstico confirmado pelo profissional',
  procedures: 'Procedimentos registrados',
  requestedExams: 'Exames solicitados',
  examResults: 'Resultados de exames registrados',
  conduct: 'Conduta registrada',
  guidance: 'Orientações registradas',
  followUpPlan: 'Plano de acompanhamento registrado',
  additionalNotes: 'Observações adicionais',
}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

function sentence(label: string, text: string): string {
  const t = clean(text)
  return /[.!?…]$/.test(t) ? `${label}: ${t}` : `${label}: ${t}.`
}

function hasText(s: string | undefined): boolean {
  return clean(s).length > 0
}

export function describeMedication(m: Medication): string {
  const bits = [clean(m.name)]
  if (hasText(m.dose)) bits.push(`dose ${clean(m.dose)}`)
  if (hasText(m.route)) bits.push(`via ${clean(m.route)}`)
  if (hasText(m.frequency)) bits.push(`frequência ${clean(m.frequency)}`)
  const status = m.status === 'administrado' ? 'registrado como ADMINISTRADO' : 'registrado como PRESCRITO'
  return `${bits.join(', ')} (${status})`
}

function sortChrono(records: ClinicalRecord[]): ClinicalRecord[] {
  return [...records].sort(
    (a, b) => a.attendedAt.getTime() - b.attendedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )
}

function inPeriod(r: ClinicalRecord, from?: string, to?: string): boolean {
  const day = toIsoDate(r.attendedAt)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function hasMedications(c: ClinicalContent): boolean {
  return (c.medications?.length ?? 0) > 0
}

function relevantForKind(r: ClinicalRecord, kind: ReportKind): boolean {
  const c = r.content
  switch (kind) {
    case 'medicamentos':
      return hasMedications(c) || r.type === 'prescricao' || hasText(c.conduct) || hasText(c.procedures)
    case 'exames':
      return r.type === 'exame' || hasText(c.examResults) || hasText(c.requestedExams)
    default:
      return true
  }
}

function retroactiveNote(r: ClinicalRecord): string {
  const a = toIsoDate(r.attendedAt)
  const c = toIsoDate(r.createdAt)
  return a === c ? '' : ` (registro inserido no sistema em ${formatDateTime(r.createdAt)})`
}

function header(r: ClinicalRecord): string {
  return `Em ${formatDateTime(r.attendedAt)} — ${RECORD_TYPE_LABEL[r.type]} [${recordCode(r.id)}]${retroactiveNote(r)}, por ${r.authorName}`
}

function amendmentLines(list: Amendment[] | undefined): string[] {
  if (!list?.length) return []
  return list.map((a) => {
    if (a.kind === 'retificacao') {
      const field = a.field ? FIELD_LABEL[a.field] : 'campo'
      return `  ↳ Retificação em ${formatDateTime(a.createdAt)} por ${a.authorName} (${field}). Motivo: ${clean(a.reason)}. Valor original preservado: "${clean(a.previousValue) || '(vazio)'}". Valor retificado: "${clean(a.text)}".`
    }
    return `  ↳ Adendo em ${formatDateTime(a.createdAt)} por ${a.authorName}. Motivo: ${clean(a.reason)}. Texto: ${clean(a.text)}`
  })
}

function recordNarrative(r: ClinicalRecord, detail: DetailLevel, amendments?: Amendment[]): string {
  const lines: string[] = [`${header(r)}:`]
  const fields = FIELDS_BY_DETAIL[detail]
  const c = r.content
  for (const f of fields) {
    const v = c[f]
    if (typeof v === 'string' && hasText(v)) lines.push(`  • ${sentence(NARRATIVE_LABEL[f] ?? FIELD_LABEL[f], v)}`)
  }
  if (hasMedications(c)) {
    const list = (c.medications ?? []).filter((m) => hasText(m.name))
    const shown = detail === 'resumido' ? list.slice(0, 5) : list
    for (const m of shown) lines.push(`  • Medicamento: ${describeMedication(m)}.`)
    if (shown.length < list.length) lines.push(`  • (+${list.length - shown.length} medicamento(s) no registro original)`)
  }
  if (detail === 'detalhado' && hasText(c.returnDate)) lines.push(`  • Data sugerida para retorno: ${formatIsoDate(c.returnDate)}.`)
  if (r.attachments.length) lines.push(`  • Anexos no registro original: ${r.attachments.map((a) => a.name).join(', ')}.`)
  if (lines.length === 1) lines.push('  • Registro sem conteúdo textual nos campos selecionados para este nível de detalhe; consulte o registro original.')
  lines.push(...amendmentLines(amendments))
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Detecção de informações ausentes ou contraditórias
// ---------------------------------------------------------------------------
export function detectWarnings(
  records: ClinicalRecord[],
  patient: BuildInput['patient'],
  now: Date,
  excludedDrafts: number,
): string[] {
  const w: string[] = []
  if (excludedDrafts > 0) {
    w.push(`${excludedDrafts} registro(s) em rascunho no período não foram incluídos; apenas registros finalizados entram no relatório.`)
  }
  const chrono = sortChrono(records)

  // Medicamentos sem dados completos / apenas prescritos / doses divergentes
  const byMed = new Map<string, Array<{ r: ClinicalRecord; m: Medication }>>()
  for (const r of chrono) {
    for (const m of r.content.medications ?? []) {
      if (!hasText(m.name)) continue
      const key = normalize(m.name)
      byMed.set(key, [...(byMed.get(key) ?? []), { r, m }])
      const missing = [!hasText(m.dose) && 'dose', !hasText(m.route) && 'via', !hasText(m.frequency) && 'frequência'].filter(Boolean)
      if (missing.length) {
        w.push(`${recordCode(r.id)} (${formatDate(r.attendedAt)}): medicamento "${clean(m.name)}" sem ${missing.join(', ')} registrada(o).`)
      }
    }
  }
  for (const [, list] of byMed) {
    const doses = new Set(list.map((x) => normalize(x.m.dose)).filter(Boolean))
    if (doses.size > 1) {
      const desc = list
        .filter((x) => hasText(x.m.dose))
        .map((x) => `${clean(x.m.dose)} em ${formatDate(x.r.attendedAt)} [${recordCode(x.r.id)}]`)
        .join('; ')
      w.push(`Medicamento "${clean(list[0].m.name)}" consta com doses diferentes (${desc}). Pode refletir ajuste de conduta ou divergência de registro; o profissional deve esclarecer.`)
    }
    for (const attr of ['frequency', 'route'] as const) {
      const vals = new Set(list.map((x) => normalize(x.m[attr])).filter(Boolean))
      if (vals.size > 1) {
        const desc = list
          .filter((x) => hasText(x.m[attr]))
          .map((x) => `${clean(x.m[attr])} em ${formatDate(x.r.attendedAt)} [${recordCode(x.r.id)}]`)
          .join('; ')
        w.push(`Medicamento "${clean(list[0].m.name)}" consta com ${attr === 'frequency' ? 'frequências' : 'vias'} diferentes (${desc}). O profissional deve esclarecer se houve alteração de conduta.`)
      }
    }
    if (list.every((x) => x.m.status === 'administrado')) {
      w.push(`Medicamento "${clean(list[0].m.name)}" consta como administrado, sem registro de prescrição correspondente no período analisado.`)
    }
    if (list.every((x) => x.m.status === 'prescrito')) {
      w.push(`Medicamento "${clean(list[0].m.name)}" consta apenas como prescrito; não há registro de administração.`)
    }
  }

  // Diagnósticos confirmados divergentes
  const confirmed = chrono.filter((r) => hasText(r.content.confirmedDiagnosis))
  const distinct = new Set(confirmed.map((r) => normalize(r.content.confirmedDiagnosis)))
  if (distinct.size > 1) {
    const d = confirmed.map((r) => `"${clean(r.content.confirmedDiagnosis)}" em ${formatDate(r.attendedAt)} [${recordCode(r.id)}]`).join('; ')
    w.push(`Há mais de um diagnóstico confirmado distinto no período: ${d}. Verifique se há atualização ou contradição.`)
  }

  // Retorno sugerido anterior ao atendimento; diagnóstico confirmado sem avaliação; registros idênticos no mesmo dia
  for (const r of chrono) {
    const ret = r.content.returnDate
    if (ret && ret < toIsoDate(r.attendedAt)) {
      w.push(`${recordCode(r.id)} (${formatDate(r.attendedAt)}): a data sugerida para retorno (${formatIsoDate(ret)}) é anterior à data do atendimento.`)
    }
    if (hasText(r.content.confirmedDiagnosis) && !hasText(r.content.assessment)) {
      w.push(`${recordCode(r.id)} (${formatDate(r.attendedAt)}): diagnóstico confirmado registrado sem avaliação do profissional que o fundamente.`)
    }
  }
  const sig = new Map<string, ClinicalRecord>()
  for (const r of chrono) {
    const key = `${toIsoDate(r.attendedAt)}|${r.type}|${normalize(JSON.stringify(r.content))}`
    const prev = sig.get(key)
    if (prev) w.push(`${recordCode(r.id)} e ${recordCode(prev.id)} (${formatDate(r.attendedAt)}) têm conteúdo idêntico no mesmo dia; possível registro duplicado.`)
    else sig.set(key, r)
  }

  // Evolução sem conduta
  for (const r of chrono) {
    if (r.type === 'evolucao' && !hasText(r.content.conduct)) {
      w.push(`${recordCode(r.id)} (${formatDate(r.attendedAt)}): evolução clínica sem conduta registrada.`)
    }
    if (r.type === 'evolucao' && !hasText(r.content.assessment)) {
      w.push(`${recordCode(r.id)} (${formatDate(r.attendedAt)}): evolução clínica sem avaliação do profissional registrada.`)
    }
  }

  // Exames solicitados sem resultado localizado
  chrono.forEach((r, i) => {
    if (!hasText(r.content.requestedExams)) return
    const later = chrono.slice(i).some((x) => hasText(x.content.examResults) || x.type === 'exame')
    if (!later) {
      w.push(`${recordCode(r.id)} (${formatDate(r.attendedAt)}): exame(s) solicitado(s) sem resultado localizado nos registros do período analisado.`)
    }
  })

  // Retorno sugerido sem atendimento posterior
  const todayIso = toIsoDate(now)
  chrono.forEach((r, i) => {
    const ret = r.content.returnDate
    if (!ret || ret >= todayIso) return
    const after = chrono.slice(i + 1).some((x) => toIsoDate(x.attendedAt) >= toIsoDate(r.attendedAt))
    if (!after) {
      w.push(`${recordCode(r.id)}: retorno sugerido para ${formatIsoDate(ret)} sem atendimento posterior registrado no período.`)
    }
  })

  // Alergias conhecidas x medicamentos registrados
  const allergies = normalize(patient.allergies)
  if (allergies) {
    for (const [key, list] of byMed) {
      const head = key.split(' ')[0]
      if (head.length >= 4 && allergies.includes(head)) {
        w.push(`ATENÇÃO: "${clean(list[0].m.name)}" consta nos registros e o cadastro do paciente informa alergia que menciona este termo. Revisar.`)
      }
    }
  }

  // Registros retroativos
  const retro = chrono.filter((r) => toIsoDate(r.attendedAt) !== toIsoDate(r.createdAt))
  if (retro.length) {
    w.push(`${retro.length} registro(s) foram inseridos em data diferente da data do atendimento (ver a data de inserção citada em cada registro).`)
  }
  return w
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------
function periodText(from?: string, to?: string, records: ClinicalRecord[] = []): string {
  if (from || to) return `${from ? formatIsoDate(from) : 'início do histórico'} a ${to ? formatIsoDate(to) : 'data atual'}`
  if (records.length) {
    const s = sortChrono(records)
    return `todo o histórico (${formatDate(s[0].attendedAt)} a ${formatDate(s[s.length - 1].attendedAt)})`
  }
  return 'todo o histórico'
}

function scopeSection(input: BuildInput, included: ClinicalRecord[]): { title: string; body: string; refs: string[] } {
  const counts = new Map<RecordType, number>()
  included.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1))
  const typeList = [...counts.entries()].map(([t, n]) => `${RECORD_TYPE_LABEL[t]}: ${n}`).join('; ')
  const age = calcAge(input.patient.birthDate, input.now)
  const lines = [
    `Período analisado: ${periodText(input.periodFrom, input.periodTo, included)}.`,
    `Registros considerados: ${included.length}${typeList ? ` (${typeList})` : ''}.`,
    age !== null ? `Idade atual do paciente: ${age} ano(s).` : '',
    hasText(input.patient.allergies) ? `Alergias conhecidas (cadastro): ${clean(input.patient.allergies)}.` : 'Alergias conhecidas: não informadas no cadastro.',
    'Este documento é uma consolidação dos registros existentes no prontuário. Não substitui o julgamento clínico do profissional nem os registros originais, aos quais se referem os códigos REG-XXXXXX.',
  ].filter(Boolean)
  return { title: 'Escopo e base de dados', body: lines.join('\n'), refs: [] }
}

function timelineSection(chrono: ClinicalRecord[]) {
  const body = chrono
    .map((r) => {
      const c = r.content
      const summary = clean(c.chiefComplaint) || clean(c.title) || clean(c.assessment) || clean(c.procedures) || clean(c.examResults) || (hasMedications(c) ? 'Medicação registrada' : '') || clean(c.additionalNotes) || 'Sem resumo textual'
      return `• ${formatDateTime(r.attendedAt)} — ${RECORD_TYPE_LABEL[r.type]} [${recordCode(r.id)}]: ${summary.length > 160 ? `${summary.slice(0, 159)}…` : summary}`
    })
    .join('\n')
  return { title: 'Linha do tempo', body, refs: chrono.map((r) => r.id) }
}

function evolutionComparison(chrono: ClinicalRecord[]) {
  const lines: string[] = []
  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1]
    const cur = chrono[i]
    const days = Math.round((new Date(`${toIsoDate(cur.attendedAt)}T12:00:00Z`).getTime() - new Date(`${toIsoDate(prev.attendedAt)}T12:00:00Z`).getTime()) / 86400000)
    const gap = days === 0 ? 'no mesmo dia' : `${days} dia(s) após`
    const ev = clean(cur.content.evolution)
    if (ev) {
      lines.push(`• ${formatDate(cur.attendedAt)} [${recordCode(cur.id)}], ${gap} o registro de ${formatDate(prev.attendedAt)} [${recordCode(prev.id)}]: ${ev}`)
    } else {
      lines.push(`• ${formatDate(cur.attendedAt)} [${recordCode(cur.id)}], ${gap} o registro de ${formatDate(prev.attendedAt)} [${recordCode(prev.id)}]: não há descrição de evolução em relação ao atendimento anterior neste registro.`)
    }
  }
  return {
    title: 'Evolução entre os registros',
    body: lines.length ? lines.join('\n') : 'Há apenas um registro no período; não é possível descrever evolução entre atendimentos.',
    refs: chrono.map((r) => r.id),
  }
}

function medicationSection(chrono: ClinicalRecord[]) {
  const lines: string[] = []
  const refs: string[] = []
  for (const r of chrono) {
    const meds = (r.content.medications ?? []).filter((m) => hasText(m.name))
    const extras: string[] = []
    if (hasText(r.content.conduct)) extras.push(sentence('Conduta registrada', r.content.conduct ?? ''))
    if (hasText(r.content.procedures)) extras.push(sentence('Procedimentos registrados', r.content.procedures ?? ''))
    if (hasText(r.content.guidance)) extras.push(sentence('Orientações registradas', r.content.guidance ?? ''))
    if (!meds.length && !extras.length) continue
    refs.push(r.id)
    lines.push(`${formatDateTime(r.attendedAt)} [${recordCode(r.id)}]:`)
    meds.forEach((m) => lines.push(`  • ${describeMedication(m)}.`))
    extras.forEach((e) => lines.push(`  • ${e}`))
  }
  return {
    title: 'Medicamentos e condutas documentadas',
    body: lines.length ? lines.join('\n') : 'Nenhum medicamento ou conduta documentado nos registros selecionados.',
    refs,
  }
}

function examsSection(chrono: ClinicalRecord[]) {
  const lines: string[] = []
  const refs: string[] = []
  for (const r of chrono) {
    const parts: string[] = []
    if (hasText(r.content.requestedExams)) parts.push(sentence('Exames solicitados', r.content.requestedExams ?? ''))
    if (hasText(r.content.examResults)) parts.push(sentence('Resultados registrados', r.content.examResults ?? ''))
    if (r.type === 'exame' && hasText(r.content.assessment)) parts.push(sentence('Avaliação do profissional', r.content.assessment ?? ''))
    if (!parts.length) continue
    refs.push(r.id)
    lines.push(`${formatDateTime(r.attendedAt)} [${recordCode(r.id)}]:`)
    parts.forEach((p) => lines.push(`  • ${p}`))
    if (r.attachments.length) lines.push(`  • Anexos: ${r.attachments.map((a) => a.name).join(', ')}.`)
  }
  return {
    title: 'Exames solicitados e resultados',
    body: lines.length ? lines.join('\n') : 'Nenhum exame ou resultado documentado nos registros selecionados.',
    refs,
  }
}

function synthesisSection(chrono: ClinicalRecord[]) {
  const lines: string[] = []
  const refs: string[] = []
  if (!chrono.length) return { title: 'Síntese do período', body: 'Não há dados suficientes para uma síntese.', refs }
  const first = chrono[0]
  const last = chrono[chrono.length - 1]
  lines.push(`• Foram documentados ${chrono.length} registro(s) entre ${formatDate(first.attendedAt)} e ${formatDate(last.attendedAt)}.`)

  const confirmed = chrono.filter((r) => hasText(r.content.confirmedDiagnosis))
  if (confirmed.length) {
    lines.push(`• Diagnóstico(s) confirmado(s) pelo profissional: ${confirmed.map((r) => `"${clean(r.content.confirmedDiagnosis)}" (${formatDate(r.attendedAt)} [${recordCode(r.id)}])`).join('; ')}.`)
    refs.push(...confirmed.map((r) => r.id))
  } else {
    lines.push('• Não há diagnóstico confirmado registrado no período.')
  }
  const hyp = chrono.filter((r) => hasText(r.content.diagnosticHypotheses))
  if (hyp.length) {
    lines.push(`• Hipóteses diagnósticas registradas (não são diagnósticos confirmados): ${hyp.map((r) => `"${clean(r.content.diagnosticHypotheses)}" (${formatDate(r.attendedAt)} [${recordCode(r.id)}])`).join('; ')}.`)
    refs.push(...hyp.map((r) => r.id))
  }
  const meds = chrono.flatMap((r) => (r.content.medications ?? []).filter((m) => hasText(m.name)).map((m) => ({ r, m })))
  if (meds.length) {
    lines.push(`• Medicamentos documentados: ${meds.map(({ r, m }) => `${clean(m.name)} — ${m.status === 'administrado' ? 'administrado' : 'prescrito'} em ${formatDate(r.attendedAt)}`).join('; ')}.`)
    refs.push(...meds.map((x) => x.r.id))
  }
  const conducts = chrono.filter((r) => hasText(r.content.conduct))
  lines.push(`• Condutas registradas em ${conducts.length} de ${chrono.length} registro(s).`)
  const lastReturn = [...chrono].reverse().find((r) => r.content.returnDate)
  if (lastReturn) {
    lines.push(`• Último retorno sugerido nos registros: ${formatIsoDate(lastReturn.content.returnDate)} [${recordCode(lastReturn.id)}].`)
    refs.push(lastReturn.id)
  }
  lines.push('• Esta síntese reproduz apenas o que consta nos registros; não estabelece relações de causa e efeito nem conclusões clínicas.')
  return { title: 'Síntese do período', body: lines.join('\n'), refs: [...new Set(refs)] }
}

function referralSection(input: BuildInput, chrono: ClinicalRecord[]) {
  const age = calcAge(input.patient.birthDate, input.now)
  const confirmed = chrono.filter((r) => hasText(r.content.confirmedDiagnosis))
  const hyp = chrono.filter((r) => hasText(r.content.diagnosticHypotheses))
  const lines = [
    `Paciente: ${input.patient.fullName}${age !== null ? `, ${age} ano(s)` : ''}.`,
    hasText(input.patient.allergies) ? `Alergias conhecidas: ${clean(input.patient.allergies)}.` : 'Alergias: não informadas no cadastro.',
    hasText(input.patient.clinicalInfo) ? `Informações clínicas relevantes (cadastro): ${clean(input.patient.clinicalInfo)}.` : '',
    confirmed.length ? `Diagnóstico(s) confirmado(s): ${[...new Set(confirmed.map((r) => clean(r.content.confirmedDiagnosis)))].join('; ')}.` : 'Diagnóstico confirmado: não há registro.',
    hyp.length ? `Hipóteses diagnósticas em investigação: ${[...new Set(hyp.map((r) => clean(r.content.diagnosticHypotheses)))].join('; ')}.` : '',
    'Motivo do encaminhamento / pergunta clínica: [a ser preenchido pelo profissional responsável].',
  ].filter(Boolean)
  return { title: 'Dados para acompanhamento ou encaminhamento', body: lines.join('\n'), refs: [...confirmed, ...hyp].map((r) => r.id) }
}

function pushOptional(raw: Array<{ title: string; body: string; refs: string[] }>, ...items: Array<{ title: string; body: string; refs: string[] } | null>) {
  for (const i of items) if (i) raw.push(i)
}

function proseSection(chrono: ClinicalRecord[]) {
  return {
    title: 'Narrativa cronológica em texto corrido',
    body: chrono.map((r) => proseParagraph(r, RECORD_TYPE_LABEL[r.type])).join('\n\n'),
    refs: chrono.map((r) => r.id),
  }
}

function warningsSection(warnings: string[]) {
  return {
    title: 'Informações ausentes, contraditórias ou que necessitam esclarecimento',
    body: warnings.length ? warnings.map((w) => `• ${w}`).join('\n') : 'Nenhuma inconsistência foi detectada automaticamente. A revisão do profissional continua necessária.',
    refs: [] as string[],
  }
}

export function buildReport(input: BuildInput): BuildOutput {
  const now = input.now ?? new Date()
  const inRange = input.records.filter((r) => inPeriod(r, input.periodFrom, input.periodTo))
  const typed = input.types?.length ? inRange.filter((r) => input.types?.includes(r.type)) : inRange
  const drafts = typed.filter((r) => r.status !== 'finalizado')
  const finals = typed.filter((r) => r.status === 'finalizado')
  const included = sortChrono(finals.filter((r) => relevantForKind(r, input.kind)))

  const warnings = detectWarnings(included, input.patient, now, drafts.length)
  const title = REPORT_KIND_LABEL[input.kind]
  const raw: Array<{ title: string; body: string; refs: string[] }> = []

  if (!included.length) {
    warnings.unshift('Não há registros finalizados que atendam aos filtros selecionados; não há dados suficientes para gerar conclusões.')
    raw.push(scopeSection(input, included), warningsSection(warnings))
  } else {
    raw.push(scopeSection(input, included))
    const narrative = (heading: string) => ({
      title: heading,
      body: included.map((r) => recordNarrative(r, input.detail, input.amendments?.[r.id])).join('\n\n'),
      refs: included.map((r) => r.id),
    })
    switch (input.kind) {
      case 'completo':
      case 'periodo':
      case 'por_tipo':
        raw.push(narrative('Histórico e evolução clínica'), proseSection(included), evolutionComparison(included))
        pushOptional(raw, symptomPersistence(included), vitalsSection(included))
        raw.push(synthesisSection(included))
        pushOptional(raw, glossarySection(included))
        break
      case 'resumo':
        raw.push(narrative('Resumo cronológico'), proseSection(included))
        pushOptional(raw, vitalsSection(included))
        raw.push(synthesisSection(included))
        break
      case 'medicamentos':
        raw.push(medicationSection(included), synthesisSection(included))
        break
      case 'exames':
        raw.push(examsSection(included))
        break
      case 'linha_do_tempo':
        raw.push(timelineSection(included))
        break
      case 'encaminhamento':
        raw.push(referralSection(input, included), proseSection(included))
        pushOptional(raw, vitalsSection(included))
        raw.push(medicationSection(included), examsSection(included))
        break
    }
    raw.push(warningsSection(warnings))
  }

  const sections: ReportSection[] = raw.map((s, i) => ({ id: `s${i + 1}`, ...s }))
  return { title, sections, warnings, sourceRecordIds: included.map((r) => r.id), included }
}

/** Texto plano completo do relatório (usado para hash de integridade e verificações). */
export function sectionsToText(sections: ReportSection[]): string {
  return sections.map((s) => `${s.title}\n${s.body}`).join('\n\n')
}
