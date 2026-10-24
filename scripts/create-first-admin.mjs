/**
 * Cria (ou promove) o PRIMEIRO administrador de um projeto Firebase real.
 *
 * Uso (PowerShell):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\caminho\fora-do-repo\service-account.json"
 *   $env:ADMIN_EMAIL = "voce@clinica.com.br"; $env:ADMIN_NAME = "Seu Nome"
 *   npm run admin:create
 *
 * A conta é criada com senha aleatória (não exibida); você define a sua senha pelo
 * link "Esqueci minha senha" na tela de login. NUNCA versione o arquivo da conta de serviço.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'

const email = process.env.ADMIN_EMAIL
const name = process.env.ADMIN_NAME
if (!email || !name) {
  console.error('Defina ADMIN_EMAIL e ADMIN_NAME.')
  process.exit(1)
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Defina GOOGLE_APPLICATION_CREDENTIALS apontando para a chave da conta de serviço (fora do repositório).')
  process.exit(1)
}

initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID })
const auth = getAuth()
const db = getFirestore()

let user
try {
  user = await auth.getUserByEmail(email)
  console.log('Usuário já existe no Authentication; apenas o perfil será criado/atualizado.')
} catch {
  user = await auth.createUser({ email, displayName: name, password: randomBytes(18).toString('base64url') + 'Aa1!' })
  console.log('Usuário criado no Authentication.')
}
await db.doc(`users/${user.uid}`).set({ name, email: email.toLowerCase(), role: 'admin', active: true, registration: '', specialty: '', createdAt: FieldValue.serverTimestamp() }, { merge: true })
console.log(`Administrador autorizado: ${email}. Use "Esqueci minha senha" na tela de login para definir a senha.`)
