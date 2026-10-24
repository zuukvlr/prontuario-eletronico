import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logAudit } from './auditService'
import type { AppSettings, UserProfile } from '@/types'

export const DEFAULT_SETTINGS: AppSettings = {
  clinicName: 'Clínica (configure em Configurações)',
  clinicDocument: '',
  clinicAddress: '',
  aiEnabled: false,
  aiLocalEnabled: false,
  aiModel: 'claude-sonnet-5-5',
  retentionYears: 20,
}

export async function getSettings(): Promise<AppSettings> {
  const snap = await getDoc(doc(db, 'settings', 'app'))
  return { ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<AppSettings>) : {}) }
}

export async function saveSettings(actor: UserProfile, s: AppSettings): Promise<void> {
  await setDoc(doc(db, 'settings', 'app'), { ...s, updatedAt: serverTimestamp(), updatedBy: actor.uid }, { merge: true })
  await logAudit(actor, 'configuracao.editar', 'configuracao', 'Configurações do sistema atualizadas')
}
