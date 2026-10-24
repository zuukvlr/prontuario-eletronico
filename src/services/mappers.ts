import { Timestamp, type DocumentData, type QueryDocumentSnapshot, type DocumentSnapshot } from 'firebase/firestore'
import type { Amendment, AuditLog, ClinicalRecord, GeneratedReport, Patient, UserProfile } from '@/types'

type Snap = QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>

export function toDate(v: unknown): Date | undefined {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return undefined
}

function req(v: unknown): Date {
  return toDate(v) ?? new Date(0)
}

export function userFromSnap(s: Snap): UserProfile {
  const d = s.data() ?? {}
  return { uid: s.id, name: d.name, email: d.email, role: d.role, active: d.active === true, registration: d.registration, specialty: d.specialty, createdAt: toDate(d.createdAt) }
}

export function patientFromSnap(s: Snap): Patient {
  const d = s.data() ?? {}
  return {
    ...(d as Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>),
    id: s.id,
    accessUids: d.accessUids ?? [],
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  }
}

export function recordFromSnap(s: Snap): ClinicalRecord {
  const d = s.data() ?? {}
  return {
    id: s.id,
    patientId: d.patientId,
    type: d.type,
    attendedAt: req(d.attendedAt),
    createdAt: req(d.createdAt),
    authorUid: d.authorUid,
    authorName: d.authorName,
    authorRegistration: d.authorRegistration,
    content: d.content ?? {},
    attachments: d.attachments ?? [],
    version: d.version ?? 1,
    status: d.status,
    finalizedAt: toDate(d.finalizedAt),
    amendmentCount: d.amendmentCount ?? 0,
    accessUids: d.accessUids ?? [],
    searchTokens: d.searchTokens ?? [],
  }
}

export function amendmentFromSnap(recordId: string, s: Snap): Amendment {
  const d = s.data() ?? {}
  return {
    id: s.id,
    recordId,
    kind: d.kind,
    reason: d.reason,
    text: d.text,
    field: d.field,
    previousValue: d.previousValue,
    authorUid: d.authorUid,
    authorName: d.authorName,
    createdAt: req(d.createdAt),
  }
}

export function reportFromSnap(s: Snap): GeneratedReport {
  const d = s.data() ?? {}
  return {
    ...(d as Omit<GeneratedReport, 'id' | 'createdAt' | 'finalizedAt'>),
    id: s.id,
    sections: d.sections ?? [],
    warnings: d.warnings ?? [],
    recordTypes: d.recordTypes ?? [],
    sourceRecordIds: d.sourceRecordIds ?? [],
    accessUids: d.accessUids ?? [],
    professionalNotes: d.professionalNotes ?? '',
    createdAt: req(d.createdAt),
    finalizedAt: toDate(d.finalizedAt),
  }
}

export function auditFromSnap(s: Snap): AuditLog {
  const d = s.data() ?? {}
  return {
    id: s.id,
    action: d.action,
    entityType: d.entityType,
    entityId: d.entityId,
    patientId: d.patientId,
    actorUid: d.actorUid,
    actorName: d.actorName,
    summary: d.summary,
    createdAt: req(d.createdAt),
  }
}
