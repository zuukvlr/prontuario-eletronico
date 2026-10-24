import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut as signOutSecondary } from 'firebase/auth'
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db, firebaseConfig, useEmulators } from './firebase'
import { userFromSnap } from './mappers'
import { logAudit } from './auditService'
import type { Role, UserProfile } from '@/types'

export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('name')))
  return snap.docs.map(userFromSnap)
}

export interface NewUserInput {
  name: string
  email: string
  role: Role
  registration?: string
  specialty?: string
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(36)).join('').slice(0, 32) + 'Aa1!'
}

/**
 * Cadastro controlado: somente administradores chegam aqui (a regra do Firestore também exige).
 * Usa um app Firebase secundário para criar a conta sem derrubar a sessão do administrador.
 * O novo usuário recebe um e-mail para DEFINIR a própria senha (a senha provisória nunca é exibida).
 */
export async function createUser(actor: UserProfile, input: NewUserInput): Promise<void> {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`)
  const secondaryAuth = getAuth(secondary)
  if (useEmulators) {
    const { connectAuthEmulator } = await import('firebase/auth')
    connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
  }
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, input.email.trim(), randomPassword())
    await setDoc(doc(db, 'users', cred.user.uid), {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      active: true,
      registration: input.registration?.trim() ?? '',
      specialty: input.specialty?.trim() ?? '',
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
    })
    await sendPasswordResetEmail(secondaryAuth, input.email.trim())
    await signOutSecondary(secondaryAuth)
    await logAudit(actor, 'usuario.criar', 'usuario', `Usuário autorizado (${input.role})`, { entityId: cred.user.uid })
  } finally {
    await deleteApp(secondary)
  }
}

export async function updateUser(actor: UserProfile, uid: string, patch: Partial<Pick<UserProfile, 'name' | 'role' | 'active' | 'registration' | 'specialty'>>): Promise<void> {
  if (uid === actor.uid && (patch.active === false || (patch.role && patch.role !== actor.role))) {
    throw new Error('[app] Você não pode desativar ou rebaixar o próprio usuário.')
  }
  await updateDoc(doc(db, 'users', uid), { ...patch, updatedAt: serverTimestamp(), updatedBy: actor.uid })
  await logAudit(actor, 'usuario.editar', 'usuario', patch.active === false ? 'Usuário desativado' : 'Usuário atualizado', { entityId: uid })
}
