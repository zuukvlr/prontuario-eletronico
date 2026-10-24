import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { auditFromSnap } from './mappers'
import type { AuditAction, AuditLog, UserProfile } from '@/types'

const col = () => collection(db, 'auditLogs')

/**
 * Registra uma ação relevante. O resumo NUNCA deve conter conteúdo clínico.
 * Falhas de auditoria não interrompem a operação do usuário, mas são reportadas no console.
 */
export async function logAudit(
  actor: Pick<UserProfile, 'uid' | 'name'>,
  action: AuditAction,
  entityType: AuditLog['entityType'],
  summary: string,
  extra: { entityId?: string; patientId?: string } = {},
): Promise<void> {
  try {
    await addDoc(col(), {
      action,
      entityType,
      entityId: extra.entityId ?? null,
      patientId: extra.patientId ?? null,
      actorUid: actor.uid,
      actorName: actor.name,
      summary,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('Falha ao registrar auditoria', (e as { code?: string }).code)
  }
}

export interface AuditPage {
  items: AuditLog[]
  cursor: QueryDocumentSnapshot<DocumentData> | null
}

export async function listAudit(
  user: UserProfile,
  opts: { pageSize?: number; cursor?: QueryDocumentSnapshot<DocumentData> | null; patientId?: string } = {},
): Promise<AuditPage> {
  const size = opts.pageSize ?? 25
  const constraints = []
  if (user.role !== 'admin') constraints.push(where('actorUid', '==', user.uid))
  else if (opts.patientId) constraints.push(where('patientId', '==', opts.patientId))
  constraints.push(orderBy('createdAt', 'desc'))
  if (opts.cursor) constraints.push(startAfter(opts.cursor))
  constraints.push(limit(size))
  const snap = await getDocs(query(col(), ...constraints))
  return { items: snap.docs.map(auditFromSnap), cursor: snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null }
}
