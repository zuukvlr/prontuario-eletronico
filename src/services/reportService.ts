import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import { reportFromSnap } from './mappers'
import { logAudit } from './auditService'
import { reportHash } from '@/lib/reports/hash'
import { AppError } from '@/lib/errors'
import { toIsoDate } from '@/lib/date'
import type { DetailLevel, GeneratedReport, Patient, RecordType, ReportKind, ReportOrigin, ReportSection, UserProfile } from '@/types'

const col = () => collection(db, 'generatedReports')

function newNumber(id: string): string {
  const d = toIsoDate(new Date()).replace(/-/g, '')
  return `REL-${d}-${id.slice(0, 5).toUpperCase()}`
}

export interface NewReportInput {
  patient: Patient
  kind: ReportKind
  title: string
  periodFrom?: string
  periodTo?: string
  recordTypes: RecordType[]
  detail: DetailLevel
  origin: ReportOrigin
  aiModel?: string
  sections: ReportSection[]
  warnings: string[]
  sourceRecordIds: string[]
}

export async function createReportDraft(actor: UserProfile, input: NewReportInput, previous?: GeneratedReport): Promise<string> {
  const ref = doc(col())
  const groupId = previous?.groupId ?? ref.id
  await setDoc(ref, {
    groupId,
    version: previous ? previous.version + 1 : 1,
    parentId: previous?.id ?? null,
    number: previous ? previous.number : newNumber(ref.id),
    patientId: input.patient.id,
    patientName: input.patient.fullName,
    patientCode: input.patient.code,
    kind: input.kind,
    title: input.title,
    periodFrom: input.periodFrom ?? null,
    periodTo: input.periodTo ?? null,
    recordTypes: input.recordTypes,
    detail: input.detail,
    origin: input.origin,
    aiModel: input.aiModel ?? null,
    sections: input.sections,
    warnings: input.warnings,
    professionalNotes: previous?.professionalNotes ?? '',
    sourceRecordIds: input.sourceRecordIds,
    status: 'rascunho',
    generatedByUid: actor.uid,
    generatedByName: actor.name,
    generatedByRegistration: actor.registration ?? '',
    createdAt: serverTimestamp(),
    accessUids: input.patient.accessUids,
  })
  await logAudit(actor, previous ? 'relatorio.nova_versao' : 'relatorio.gerar', 'relatorio', previous ? `Nova versão (v${previous.version + 1}) de ${previous.number}` : `Relatório gerado (${input.origin === 'ia' ? 'com IA' : 'consolidação local'})`, {
    entityId: ref.id,
    patientId: input.patient.id,
  })
  return ref.id
}

export async function getReport(id: string): Promise<GeneratedReport | null> {
  const snap = await getDoc(doc(db, 'generatedReports', id))
  return snap.exists() ? reportFromSnap(snap) : null
}

export async function listPatientReports(user: UserProfile, patientId: string, max = 100): Promise<GeneratedReport[]> {
  const scope = user.role === 'admin' ? [] : [where('accessUids', 'array-contains', user.uid)]
  const snap = await getDocs(query(col(), where('patientId', '==', patientId), ...scope, orderBy('createdAt', 'desc'), limit(max)))
  return snap.docs.map(reportFromSnap)
}

export async function listReports(user: UserProfile, max = 50): Promise<GeneratedReport[]> {
  const c = user.role === 'admin' ? [orderBy('createdAt', 'desc'), limit(max)] : [where('accessUids', 'array-contains', user.uid), orderBy('createdAt', 'desc'), limit(max)]
  const snap = await getDocs(query(col(), ...c))
  return snap.docs.map(reportFromSnap)
}

export async function saveReportDraft(report: GeneratedReport, patch: { title: string; sections: ReportSection[]; professionalNotes: string }): Promise<void> {
  if (report.status !== 'rascunho') throw new AppError('Relatórios finalizados não podem ser alterados; crie uma nova versão.')
  await updateDoc(doc(db, 'generatedReports', report.id), { title: patch.title, sections: patch.sections, professionalNotes: patch.professionalNotes })
}

export async function discardDraft(actor: UserProfile, report: GeneratedReport): Promise<void> {
  if (report.status !== 'rascunho') throw new AppError('Somente rascunhos podem ser descartados.')
  await deleteDoc(doc(db, 'generatedReports', report.id))
  await logAudit(actor, 'relatorio.gerar', 'relatorio', `Rascunho de ${report.number} descartado`, { patientId: report.patientId })
}

/** Finaliza: grava o hash de integridade e torna o documento imutável (regras do Firestore). */
export async function finalizeReport(actor: UserProfile, report: GeneratedReport, patch: { title: string; sections: ReportSection[]; professionalNotes: string }): Promise<void> {
  if (report.status !== 'rascunho') throw new AppError('Este relatório já foi finalizado.')
  const hash = await reportHash({ ...report, ...patch })
  await updateDoc(doc(db, 'generatedReports', report.id), {
    ...patch,
    status: 'final',
    finalizedAt: serverTimestamp(),
    finalizedByName: actor.name,
    contentHash: hash,
  })
  await logAudit(actor, 'relatorio.finalizar', 'relatorio', `${report.number} v${report.version} finalizado`, { entityId: report.id, patientId: report.patientId })
}

export async function auditExport(actor: UserProfile, report: GeneratedReport, how: 'pdf' | 'impressao'): Promise<void> {
  await logAudit(actor, 'relatorio.exportar', 'relatorio', `${report.number} v${report.version} (${report.status}) exportado: ${how}`, { entityId: report.id, patientId: report.patientId })
}
