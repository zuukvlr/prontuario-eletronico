import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { amendmentFromSnap, recordFromSnap } from './mappers'
import { logAudit } from './auditService'
import { endOfDay, startOfDay } from '@/lib/date'
import { tokenize, normalize } from '@/lib/text'
import { AppError } from '@/lib/errors'
import { FIELD_LABEL } from '@/lib/recordTypes'
import { validateRecordContent } from '@/lib/schemas'
import type { Amendment, Attachment, ClinicalContent, ClinicalRecord, ContentField, Patient, RecordStatus, RecordType, UserProfile } from '@/types'

const col = () => collection(db, 'clinicalRecords')

export function newRecordId(): string {
  return doc(col()).id
}

/** Remove campos vazios e normaliza o conteúdo antes de gravar. */
export function cleanContent(c: ClinicalContent): ClinicalContent {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (Array.isArray(v)) {
      const meds = v.filter((m) => m?.name?.trim()).map((m) => ({ name: m.name.trim(), dose: m.dose?.trim() ?? '', route: m.route?.trim() ?? '', frequency: m.frequency?.trim() ?? '', status: m.status }))
      if (meds.length) out[k] = meds
    } else if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim()
    } else if (v != null) out[k] = v
  }
  return out as ClinicalContent
}

function searchTokensOf(c: ClinicalContent): string[] {
  return tokenize(
    c.title,
    c.chiefComplaint,
    c.reportedSymptoms,
    c.observedFindings,
    c.evolution,
    c.assessment,
    c.diagnosticHypotheses,
    c.confirmedDiagnosis,
    c.procedures,
    c.requestedExams,
    c.examResults,
    c.conduct,
    c.guidance,
    c.followUpPlan,
    c.additionalNotes,
    ...(c.medications ?? []).map((m) => m.name),
  )
}

export interface SaveRecordInput {
  id: string
  patient: Patient
  type: RecordType
  attendedAt: Date
  content: ClinicalContent
  attachments: Attachment[]
  status: RecordStatus
}

export async function createRecord(actor: UserProfile, input: SaveRecordInput): Promise<string> {
  const content = cleanContent(input.content)
  if (input.status === 'finalizado') {
    const err = validateRecordContent(input.type, content, input.attachments.length > 0)
    if (err) throw new AppError(err)
  }
  if (input.attendedAt.getTime() > Date.now() + 5 * 60_000) throw new AppError('A data do atendimento não pode estar no futuro.')
  await setDoc(doc(db, 'clinicalRecords', input.id), {
    patientId: input.patient.id,
    type: input.type,
    attendedAt: Timestamp.fromDate(input.attendedAt),
    createdAt: serverTimestamp(),
    authorUid: actor.uid,
    authorName: actor.name,
    authorRegistration: actor.registration ?? '',
    content,
    attachments: input.attachments,
    version: 1,
    status: input.status,
    finalizedAt: input.status === 'finalizado' ? Timestamp.now() : null,
    amendmentCount: 0,
    accessUids: input.patient.accessUids,
    searchTokens: searchTokensOf(content),
  })
  await logAudit(actor, 'registro.criar', 'registro', input.status === 'finalizado' ? 'Registro clínico criado' : 'Rascunho de registro salvo', { entityId: input.id, patientId: input.patient.id })
  return input.id
}

/** Atualiza um rascunho (apenas o autor, enquanto não finalizado). A data de criação nunca muda. */
export async function updateDraft(actor: UserProfile, current: ClinicalRecord, input: Omit<SaveRecordInput, 'patient' | 'id'>): Promise<void> {
  if (current.status !== 'rascunho') throw new AppError('Registros finalizados não podem ser editados; use adendo ou retificação.')
  const content = cleanContent(input.content)
  if (input.status === 'finalizado') {
    const err = validateRecordContent(input.type, content, input.attachments.length > 0)
    if (err) throw new AppError(err)
  }
  await updateDoc(doc(db, 'clinicalRecords', current.id), {
    type: input.type,
    attendedAt: Timestamp.fromDate(input.attendedAt),
    content,
    attachments: input.attachments,
    status: input.status,
    finalizedAt: input.status === 'finalizado' ? Timestamp.now() : null,
    version: current.version + 1,
    searchTokens: searchTokensOf(content),
  })
  await logAudit(actor, input.status === 'finalizado' ? 'registro.finalizar' : 'registro.criar', 'registro', input.status === 'finalizado' ? 'Registro finalizado' : 'Rascunho atualizado', { entityId: current.id, patientId: current.patientId })
}

export async function getRecord(id: string): Promise<ClinicalRecord | null> {
  const snap = await getDoc(doc(db, 'clinicalRecords', id))
  return snap.exists() ? recordFromSnap(snap) : null
}

export interface RecordPage {
  items: ClinicalRecord[]
  cursor: QueryDocumentSnapshot<DocumentData> | null
}

export interface RecordFilters {
  from?: string
  to?: string
  order?: 'asc' | 'desc'
}

/** Linha do tempo do paciente, paginada, ordenada pela data do atendimento (não pela de inserção). */
/** Profissionais precisam incluir o próprio UID no filtro: as regras só aprovam consultas provadamente autorizadas. */
function scope(user: UserProfile): QueryConstraint[] {
  return user.role === 'admin' ? [] : [where('accessUids', 'array-contains', user.uid)]
}

export async function listPatientRecords(user: UserProfile, patientId: string, filters: RecordFilters = {}, cursor: QueryDocumentSnapshot<DocumentData> | null = null, pageSize = 20): Promise<RecordPage> {
  const c: QueryConstraint[] = [where('patientId', '==', patientId), ...scope(user)]
  if (filters.from) c.push(where('attendedAt', '>=', Timestamp.fromDate(startOfDay(filters.from))))
  if (filters.to) c.push(where('attendedAt', '<=', Timestamp.fromDate(endOfDay(filters.to))))
  c.push(orderBy('attendedAt', filters.order ?? 'desc'))
  if (cursor) c.push(startAfter(cursor))
  c.push(limit(pageSize))
  const snap = await getDocs(query(col(), ...c))
  return { items: snap.docs.map(recordFromSnap), cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null }
}

/** Todos os registros de um paciente (para relatórios), em lotes, até um teto de segurança. */
export async function listAllPatientRecords(user: UserProfile, patientId: string, filters: RecordFilters = {}, max = 2000): Promise<ClinicalRecord[]> {
  const out: ClinicalRecord[] = []
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null
  do {
    const page: RecordPage = await listPatientRecords(user, patientId, { ...filters, order: 'asc' }, cursor, 200)
    out.push(...page.items)
    cursor = page.cursor
  } while (cursor && out.length < max)
  return out
}

export interface CrossSearch {
  from?: string
  to?: string
  patientId?: string
  types?: RecordType[]
  authorUid?: string
  term?: string
  medication?: string
  symptom?: string
  patientStatus?: 'ativo' | 'arquivado' | 'todos'
}

/**
 * Pesquisa avançada. A consulta ao banco é limitada ao que o usuário pode ler (accessUids) e ao período;
 * os demais filtros textuais são aplicados sobre os registros já autorizados trazidos ao navegador.
 */
export async function searchRecords(user: UserProfile, f: CrossSearch, cursor: QueryDocumentSnapshot<DocumentData> | null = null, batchSize = 300): Promise<{ items: ClinicalRecord[]; cursor: QueryDocumentSnapshot<DocumentData> | null; scanned: number }> {
  const c: QueryConstraint[] = []
  if (f.patientId) c.push(where('patientId', '==', f.patientId))
  c.push(...scope(user))
  if (f.from) c.push(where('attendedAt', '>=', Timestamp.fromDate(startOfDay(f.from))))
  if (f.to) c.push(where('attendedAt', '<=', Timestamp.fromDate(endOfDay(f.to))))
  c.push(orderBy('attendedAt', 'desc'))
  if (cursor) c.push(startAfter(cursor))
  c.push(limit(batchSize))
  const snap = await getDocs(query(col(), ...c))
  const all = snap.docs.map(recordFromSnap)
  const terms = tokenize(f.term)
  const med = normalize(f.medication)
  const sym = tokenize(f.symptom)
  const items = all.filter((r) => {
    if (f.types?.length && !f.types.includes(r.type)) return false
    if (f.authorUid && r.authorUid !== f.authorUid) return false
    if (terms.length && !terms.every((t) => r.searchTokens.some((x) => x.startsWith(t)))) return false
    if (med && !(r.content.medications ?? []).some((m) => normalize(m.name).includes(med))) return false
    if (sym.length) {
      const txt = normalize(`${r.content.reportedSymptoms ?? ''} ${r.content.chiefComplaint ?? ''} ${r.content.observedFindings ?? ''}`)
      if (!sym.every((s) => txt.includes(s))) return false
    }
    return true
  })
  return { items, cursor: snap.docs.length === batchSize ? snap.docs[snap.docs.length - 1] : null, scanned: all.length }
}

export async function countRecordsSince(user: UserProfile, since: Date): Promise<number> {
  const c: QueryConstraint[] = [where('createdAt', '>=', Timestamp.fromDate(since))]
  if (user.role !== 'admin') c.push(where('accessUids', 'array-contains', user.uid))
  const r = await getCountFromServer(query(col(), ...c))
  return r.data().count
}

export async function recentRecords(user: UserProfile, n = 8): Promise<ClinicalRecord[]> {
  const c: QueryConstraint[] = []
  if (user.role !== 'admin') c.push(where('accessUids', 'array-contains', user.uid))
  c.push(orderBy('createdAt', 'desc'), limit(n))
  const snap = await getDocs(query(col(), ...c))
  return snap.docs.map(recordFromSnap)
}

// ---------------------------------------------------------------------------
// Adendos e retificações: o conteúdo original NUNCA é alterado.
// ---------------------------------------------------------------------------
export async function listAmendments(recordId: string): Promise<Amendment[]> {
  const snap = await getDocs(query(collection(db, 'clinicalRecords', recordId, 'amendments'), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => amendmentFromSnap(recordId, d))
}

export async function addAmendment(
  actor: UserProfile,
  record: ClinicalRecord,
  input: { kind: 'adendo' | 'retificacao'; reason: string; text: string; field?: ContentField },
): Promise<void> {
  if (record.status !== 'finalizado') throw new AppError('Adendos só se aplicam a registros finalizados.')
  if (input.reason.trim().length < 5) throw new AppError('Informe o motivo.')
  let previousValue: string | undefined
  if (input.kind === 'retificacao' && input.field) {
    const v = record.content[input.field]
    previousValue = Array.isArray(v) ? v.map((m) => m.name).join(', ') : ((v as string | undefined) ?? '')
  }
  const amRef = doc(collection(db, 'clinicalRecords', record.id, 'amendments'))
  await runTransaction(db, async (tx) => {
    const recRef = doc(db, 'clinicalRecords', record.id)
    const snap = await tx.get(recRef)
    const count = (snap.data()?.amendmentCount ?? 0) as number
    tx.set(amRef, {
      kind: input.kind,
      reason: input.reason.trim(),
      text: input.text.trim(),
      field: input.field ?? null,
      previousValue: previousValue ?? null,
      authorUid: actor.uid,
      authorName: actor.name,
      createdAt: serverTimestamp(),
    })
    tx.update(recRef, { amendmentCount: count + 1 })
  })
  await logAudit(
    actor,
    'registro.adendo',
    'registro',
    input.kind === 'retificacao' ? `Retificação do campo "${input.field ? FIELD_LABEL[input.field] : ''}"` : 'Adendo registrado',
    { entityId: record.id, patientId: record.patientId },
  )
}

export async function auditRecordView(actor: UserProfile, record: ClinicalRecord): Promise<void> {
  await logAudit(actor, 'registro.visualizar', 'registro', 'Registro clínico consultado', { entityId: record.id, patientId: record.patientId })
}

