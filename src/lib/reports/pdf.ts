import { jsPDF } from 'jspdf'
import type { ClinicalRecord, GeneratedReport } from '@/types'
import { formatDateTime, formatIsoDate } from '@/lib/date'
import { RECORD_TYPE_LABEL } from '@/lib/recordTypes'
import { recordCode } from '@/lib/text'

/** As fontes padrão do PDF cobrem Latin-1 e alguns sinais; o restante é substituído para evitar caracteres corrompidos. */
const EXTRA_OK = new Set(['•', '—', '–', '…', '‘', '’', '“', '”'])
export function pdfSafe(text: string): string {
  return Array.from(text.replace(/↳/g, '»').replace(/≥/g, '>=').replace(/≤/g, '<='))
    .map((ch) => (ch.charCodeAt(0) <= 0xff || EXTRA_OK.has(ch) ? ch : '?'))
    .join('')
}

export interface PdfOptions {
  clinicName: string
  sourceRecords?: ClinicalRecord[]
}

const M = 18 // margem (mm)
const PAGE_W = 210
const PAGE_H = 297
const W = PAGE_W - M * 2

export const REPORT_DISCLAIMER =
  'Documento de consolidação dos registros existentes no prontuário. Não substitui os registros originais nem o julgamento clínico do profissional responsável.'

export function statusLabel(r: GeneratedReport): string {
  if (r.status === 'final') return 'FINALIZADO'
  return r.origin === 'ia' ? 'RASCUNHO GERADO POR IA — PENDENTE DE REVISÃO' : 'RASCUNHO — PENDENTE DE REVISÃO'
}

export function buildPdf(report: GeneratedReport, opts: PdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `${report.number} v${report.version}`, subject: report.title, creator: 'Prontuário Eletrônico' })
  let y = M + 12

  const ensure = (h: number) => {
    if (y + h > PAGE_H - M - 6) {
      doc.addPage()
      y = M + 12
    }
  }
  const text = (s: string, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', gap = 1.2, indent = 0, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(pdfSafe(s), W - indent) as string[]
    const lh = size * 0.42 + gap
    for (const l of lines) {
      ensure(lh)
      doc.text(l, M + indent, y)
      y += lh
    }
  }

  // --- Título e identificação ---
  text(report.title.toUpperCase(), 15, 'bold', 1.5, 0, [29, 78, 216])
  y += 1
  text('RELATÓRIO CONSOLIDADO DO PACIENTE', 9, 'normal', 1, 0, [100, 116, 139])
  y += 2
  const info: Array<[string, string]> = [
    ['Paciente', `${report.patientName} (${report.patientCode})`],
    ['Período analisado', report.periodFrom || report.periodTo ? `${formatIsoDate(report.periodFrom)} a ${report.periodTo ? formatIsoDate(report.periodTo) : 'data atual'}` : 'Todo o histórico'],
    ['Documento', `${report.number} — versão ${report.version}`],
    ['Situação', statusLabel(report)],
    ['Origem', report.origin === 'ia' ? `Consolidação assistida por IA${report.aiModel ? ` (${report.aiModel})` : ''}, sujeita à revisão do profissional` : 'Consolidação automática dos registros (sem IA)'],
    ['Gerado em', `${formatDateTime(report.createdAt)} por ${report.generatedByName}${report.generatedByRegistration ? ` — ${report.generatedByRegistration}` : ''}`],
  ]
  if (report.status === 'final') {
    info.push(['Finalizado em', `${formatDateTime(report.finalizedAt)} por ${report.finalizedByName ?? '—'}`])
    if (report.contentHash) info.push(['Hash de integridade (SHA-256)', report.contentHash])
  }
  for (const [k, v] of info) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    ensure(5)
    doc.text(pdfSafe(`${k}:`), M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(15, 23, 42)
    const lines = doc.splitTextToSize(pdfSafe(v), W - 48) as string[]
    lines.forEach((l, i) => {
      ensure(4.6)
      doc.text(l, M + 48, y + i * 4.4)
    })
    y += Math.max(1, lines.length) * 4.4 + 0.8
  }
  y += 2
  doc.setDrawColor(203, 213, 225)
  doc.line(M, y, PAGE_W - M, y)
  y += 6

  // --- Seções ---
  for (const s of report.sections) {
    ensure(18)
    text(s.title, 11.5, 'bold', 1.4, 0, [29, 78, 216])
    y += 0.5
    for (const para of s.body.split('\n')) {
      if (!para.trim()) {
        y += 1.6
        continue
      }
      const sub = /^\s{2,}/.test(para)
      text(para.trim(), 9.5, 'normal', 1.2, sub ? 5 : 0)
    }
    y += 4
  }

  // --- Referências aos registros de origem ---
  if (report.sourceRecordIds.length) {
    ensure(18)
    text('Registros de origem', 11.5, 'bold', 1.4, 0, [29, 78, 216])
    const byId = new Map((opts.sourceRecords ?? []).map((r) => [r.id, r]))
    for (const id of report.sourceRecordIds) {
      const r = byId.get(id)
      text(r ? `${recordCode(id)} — ${formatDateTime(r.attendedAt)} — ${RECORD_TYPE_LABEL[r.type]} — ${r.authorName} (inserido em ${formatDateTime(r.createdAt)})` : `${recordCode(id)} — ID ${id}`, 8.5, 'normal', 1, 2)
    }
    y += 4
  }

  // --- Observações e assinatura ---
  if (report.professionalNotes.trim()) {
    ensure(18)
    text('Observações do profissional', 11.5, 'bold', 1.4, 0, [29, 78, 216])
    text(report.professionalNotes, 9.5)
    y += 4
  }
  ensure(34)
  y += 14
  doc.setDrawColor(100, 116, 139)
  doc.line(M, y, M + 85, y)
  doc.line(M + 100, y, M + 100 + 60, y)
  y += 4.5
  text(`${report.finalizedByName ?? report.generatedByName}${report.generatedByRegistration ? ` — ${report.generatedByRegistration}` : ''}`, 8.5, 'normal', 1, 0, [71, 85, 105])
  y -= 4.3
  doc.setFontSize(8.5)
  doc.text('Data', M + 100, y)
  y += 6
  text(REPORT_DISCLAIMER, 8, 'italic', 1, 0, [100, 116, 139])

  // --- Cabeçalho, rodapé e marca d'água em todas as páginas ---
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(29, 78, 216)
    doc.text(pdfSafe(opts.clinicName), M, M)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(pdfSafe(`${report.number} v${report.version}`), PAGE_W - M, M, { align: 'right' })
    doc.setDrawColor(203, 213, 225)
    doc.line(M, M + 2.5, PAGE_W - M, M + 2.5)
    doc.setFontSize(8)
    doc.text(pdfSafe(`${report.patientName} — ${statusLabel(report)}`), M, PAGE_H - 10)
    doc.text(`Página ${p} de ${total}`, PAGE_W - M, PAGE_H - 10, { align: 'right' })
    if (report.status !== 'final') {
      doc.saveGraphicsState()
      doc.setTextColor(203, 213, 225)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(46)
      doc.text('RASCUNHO', PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 35 })
      doc.restoreGraphicsState()
    }
  }
  return doc
}

export function pdfFileName(r: GeneratedReport): string {
  return `${r.number}-v${r.version}.pdf`
}

export function downloadPdf(report: GeneratedReport, opts: PdfOptions): void {
  buildPdf(report, opts).save(pdfFileName(report))
}
