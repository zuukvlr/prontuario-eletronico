import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
const useEmulators = env.VITE_USE_EMULATORS === 'true'

// Sem configuração o app mostra uma tela de orientação (ver ConfigMissing) em vez de quebrar.
const app: FirebaseApp = getApps()[0] ?? initializeApp(isFirebaseConfigured ? firebaseConfig : { apiKey: 'unset', projectId: 'unset', appId: 'unset' })

export const auth = getAuth(app)
// Cache em memória (padrão no Web): dados clínicos não são gravados no disco do navegador.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
export const storage = getStorage(app)
export const functions = getFunctions(app, (env.VITE_FUNCTIONS_REGION as string | undefined) || 'southamerica-east1')

// A sessão vale apenas para a aba/janela atual (adequado a computadores compartilhados).
void setPersistence(auth, browserSessionPersistence)

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

export { app, useEmulators }
