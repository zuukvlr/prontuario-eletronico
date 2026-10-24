import {
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
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { patientFromSnap } from './mappers'
import { logAudit } from './auditService'
import { normalize } from '@/lib/text'
import { AppError } from '@/lib/errors'
import type { PatientFormValues } from '@/lib/schemas'
import type { Patient, PatientStatus, UserProfile } from '@/types'

const col = () => collection(db, 'patients')

export interface PatientFilters {
  status?: PatientStatus | 'todos'
  responsibleUid?: string
}

function baseConstraints(user: UserProfile, f: PatientFilters): QueryConstraint[] {
  const c: QueryConstraint[] = []
  // Professionais só consultam pacientes em que constam na lista de acesso (exigência das regras).
  if (user.role !== 'admin') c.push(where('accessUids', 'array-contains', user.uid))
  if (f.status && f.status !== 'todos') c.push(where('status', '==', f.status))
  if (f.responsibleUid) c.push(where('responsibleUid', '==', f.responsibleUid))
  return c
}

export interface PatientPage {
  items: Patient[]
  cursor: QueryDocumentSnapshot<DocumentData> | null
}

export async function listPatients(user: UserProfile, filters: PatientFilters = {}, cursor: QueryDocumentSnapshot<DocumentData> | null = null, pageSize = 20): Promise<PatientPage> {
  const c = [...baseConstraints(user, filters), orderBy('searchName')]
  if (cursor) c.push(startAfter(cursor))
  c.push(limit(pageSize))
  const snap = await getDocs(query(col(), ...c))
  return { items: snap.docs.map(patientFromSnap), cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null }
}

/**
 * Busca por nome (qualquer parte) ou identificador interno. O Firestore não tem busca de texto livre,
 * então carrega até `max` pacientes autorizados (já filtrados por status/responsável) e filtra no cliente.
 */
export async function searchPatients(user: UserProfile, term: string, filters: PatientFilters = {}, max = 500): Promise<Patient[]> {
  const t = normalize(term)
  const snap = await getDocs(query(col(), ...baseConstraints(user, filters), orderBy('searchName'), limit(max)))
  const all = snap.docs.map(patientFromSnap)
  if (!t) return all
  return all.filter((p) => p.searchName.includes(t) || p.code.toLowerCase().includes(t))
}

export async function getPatient(id: string): Promise<Patient | null> {
  const snap = await getDoc(doc(db, 'patients', id))
  return snap.exists() ? patientFromSnap(snap) : null
}

export async function countPatients(user: UserProfile): Promise<{ total: number; active: number }> {
  const scope = user.role === 'admin' ? [] : [where('accessUids', 'array-contains', user.uid)]
  const [total, active] = await Promise.all([
    getCountFromServer(query(col(), ...scope)),
    getCountFromServer(query(col(), ...scope, where('status', '==', 'ativo'))),
  ])
  return { total: total.data().count, active: active.data().count }
}

export async function findDuplicates(user: UserProfile, fullName: string, birthDate: string, excludeId?: string): Promise<Patient[]> {
  const n = normalize(fullName)
  if (n.length < 3) return []
  const c = [...baseConstraints(user, {}), where('searchName', '==', n), limit(10)]
  const snap = await getDocs(query(col(), ...c))
  return snap.docs.map(patientFromSnap).filter((p) => p.id !== excludeId && (p.birthDate === birthDate || !birthDate))
}

function toDoc(values: PatientFormValues, responsibleName: string) {
  const address = {
    street: values.street ?? '',
    number: values.number ?? '',
    complement: values.complement ?? '',
    district: values.district ?? '',
    city: values.city ?? '',
    state: (values.state ?? '').toUpperCase(),
    zip: values.zip ?? '',
  }
  return {
    fullName: values.fullName.trim().replace(/\s+/g, ' '),
    searchName: normalize(values.fullName),
    birthDate: values.birthDate,
    sex: values.sex,
    phone: values.phone ?? '',
    email: (values.email ?? '').toLowerCase(),
    address,
    guardianName: values.guardianName ?? '',
    guardianPhone: values.guardianPhone ?? '',
    emergencyContactName: values.emergencyContactName ?? '',
    emergencyContactPhone: values.emergencyContactPhone ?? '',
    firstAttendanceDate: values.firstAttendanceDate ?? '',
    responsibleUid: values.responsibleUid,
    responsibleName,
    accessUids: [...new Set([values.responsibleUid, ...values.extraAccessUids])],
    allergies: values.allergies ?? '',
    clinicalInfo: values.clinicalInfo ?? '',
    notes: values.notes ?? '',
  }
}

export async function createPatient(actor: UserProfile, values: PatientFormValues, responsibleName: string): Promise<string> {
  const ref = doc(col())
  const counterRef = doc(db, 'settings', 'counters')
  await runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef)
    const next = ((counter.exists() ? counter.data().patientSeq : 0) as number) + 1
    tx.set(counterRef, { patientSeq: next }, { merge: true })
    tx.set(ref, {
      ...toDoc(values, responsibleName),
      code: `PAC-${String(next).padStart(6, '0')}`,
      status: 'ativo',
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    })
  })
  await logAudit(actor, 'paciente.criar', 'paciente', 'Paciente cadastrado', { entityId: ref.id, patientId: ref.id })
  return ref.id
}

async function syncAccess(collectionName: 'clinicalRecords' | 'generatedReports', patientId: string, accessUids: string[]) {
  const snap = await getDocs(query(collection(db, collectionName), where('patientId', '==', patientId)))
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { accessUids }))
    await batch.commit()
  }
}

export async function updatePatient(actor: UserProfile, current: Patient, values: PatientFormValues, responsibleName: string): Promise<void> {
  const data = toDoc(values, responsibleName)
  const accessChanged = [...current.accessUids].sort().join() !== [...data.accessUids].sort().join()
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, 'patients', current.id), { ...data, updatedAt: serverTimestamp(), updatedBy: actor.uid })
  })
  if (accessChanged) {
    // Mantém a lista de acesso dos registros e relatórios coerente com a do paciente.
    await syncAccess('clinicalRecords', current.id, data.accessUids)
    await syncAccess('generatedReports', current.id, data.accessUids)
  }
  await logAudit(actor, 'paciente.editar', 'paciente', accessChanged ? 'Cadastro e permissões de acesso atualizados' : 'Cadastro atualizado', { entityId: current.id, patientId: current.id })
}

export async function archivePatient(actor: UserProfile, patient: Patient, reason: string): Promise<void> {
  if (reason.trim().length < 5) throw new AppError('Informe o motivo do arquivamento.')
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, 'patients', patient.id), { status: 'arquivado', archivedReason: reason.trim(), updatedAt: serverTimestamp(), updatedBy: actor.uid })
  })
  await logAudit(actor, 'paciente.arquivar', 'paciente', 'Paciente arquivado (histórico preservado)', { entityId: patient.id, patientId: patient.id })
}

export async function reactivatePatient(actor: UserProfile, patient: Patient): Promise<void> {
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, 'patients', patient.id), { status: 'ativo', archivedReason: '', updatedAt: serverTimestamp(), updatedBy: actor.uid })
  })
  await logAudit(actor, 'paciente.reativar', 'paciente', 'Paciente reativado', { entityId: patient.id, patientId: patient.id })
}
