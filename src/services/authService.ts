import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { userFromSnap } from './mappers'
import { AppError } from '@/lib/errors'
import type { UserProfile } from '@/types'

export function watchAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb)
}

export async function login(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
  return cred.user
}

export async function logout(): Promise<void> {
  await signOut(auth)
}

/** Envia o e-mail de redefinição. Sempre resolve igual, para não revelar quais e-mails existem. */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return
    throw e
  }
}

/** Carrega o perfil autorizado. Quem está autenticado mas não consta em /users não tem acesso ao sistema. */
export async function loadProfile(uid: string): Promise<UserProfile> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) throw new AppError('Seu usuário não está autorizado a usar o sistema. Procure o administrador.')
  const profile = userFromSnap(snap)
  if (!profile.active) throw new AppError('Seu acesso está desativado. Procure o administrador.')
  return profile
}
