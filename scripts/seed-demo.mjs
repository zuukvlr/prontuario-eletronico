/**
 * Popula os EMULADORES locais com dados 100% fictícios (nunca use contra produção).
 *   Terminal 1: npm run emulators
 *   Terminal 2: npm run seed:demo      (e, no .env.local, VITE_USE_EMULATORS=true)
 * Contas de demonstração (apenas no emulador): admin@demo.local / profissional@demo.local, senha "Demo@12345".
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
if (!process.env.FIRESTORE_EMULATOR_HOST.startsWith('127.0.0.1') && !process.env.FIRESTORE_EMULATOR_HOST.startsWith('localhost')) {
  console.error('Recusado: o seed só roda contra emulador local.')
  process.exit(1)
}

initializeApp({ projectId: 'demo-prontuario' })
const auth = getAuth()
const db = getFirestore()
const PASS = 'Demo@12345'

async function ensureUser(email, name, role, registration) {
  let u
  try {
    u = await auth.getUserByEmail(email)
  } catch {
    u = await auth.createUser({ email, password: PASS, displayName: name })
  }
  await db.doc(`users/${u.uid}`).set({ name, email, role, active: true, registration, specialty: '', createdAt: FieldValue.serverTimestamp() })
  return u.uid
}

const adminUid = await ensureUser('admin@demo.local', 'Admin Demonstração', 'admin', '')
const profUid = await ensureUser('profissional@demo.local', 'Dra. Maria Fictícia', 'professional', 'CRM-SP 000000 (fictício)')

const accessUids = [profUid]
const patientRef = db.collection('patients').doc('demo-joao')
await patientRef.set({
  code: 'PAC-000001',
  fullName: 'João da Silva (fictício)',
  searchName: 'joao da silva (ficticio)',
  birthDate: '1985-03-12',
  sex: 'masculino',
  phone: '(11) 90000-0000',
  email: '',
  address: {},
  responsibleUid: profUid,
  responsibleName: 'Dra. Maria Fictícia',
  accessUids,
  allergies: 'Nenhuma conhecida (dado fictício)',
  clinicalInfo: '',
  notes: 'Paciente de demonstração.',
  status: 'ativo',
  createdBy: adminUid,
  createdAt: FieldValue.serverTimestamp(),
})
await db.doc('settings/counters').set({ patientSeq: 1 })
await db.doc('settings/app').set({ clinicName: 'Clínica Demonstração', aiEnabled: false, aiModel: 'claude-sonnet-5-5', retentionYears: 20 })

const at = (iso) => Timestamp.fromDate(new Date(`${iso}-03:00`))
const base = { patientId: 'demo-joao', authorUid: profUid, authorName: 'Dra. Maria Fictícia', authorRegistration: 'CRM-SP 000000 (fictício)', attachments: [], version: 1, status: 'finalizado', amendmentCount: 0, accessUids, createdAt: FieldValue.serverTimestamp() }
const records = [
  { type: 'evolucao', attendedAt: at('2026-10-01T09:00:00'), content: { chiefComplaint: 'Dificuldade para respirar', reportedSymptoms: 'Falta de ar aos esforços.', observedFindings: 'Sibilos discretos à ausculta.', assessment: 'Quadro respiratório a acompanhar.', diagnosticHypotheses: 'Hipótese de crise respiratória leve', conduct: 'Nebulização realizada no consultório.' } },
  { type: 'evolucao', attendedAt: at('2026-10-02T10:00:00'), content: { chiefComplaint: 'Retorno para acompanhamento', reportedSymptoms: 'Refere melhora parcial da falta de ar.', evolution: 'Melhora parcial em relação ao atendimento anterior.', assessment: 'Evolução favorável.', conduct: 'Manter orientações.' } },
  { type: 'evolucao', attendedAt: at('2026-10-03T08:30:00'), content: { chiefComplaint: 'Mancha no rosto', observedFindings: 'Mancha avermelhada na região malar direita, cerca de 2 cm.', assessment: 'Lesão a esclarecer.', guidance: 'Evitar exposição solar.', conduct: 'Observação clínica.' } },
  { type: 'prescricao', attendedAt: at('2026-10-04T11:00:00'), content: { assessment: 'Início de tratamento conforme avaliação.', medications: [{ name: 'Medicamento Exemplo', dose: '500 mg', route: 'VO', frequency: '8/8h', status: 'prescrito' }], guidance: 'Tomar após as refeições.', followUpPlan: 'Reavaliar em 7 dias.', returnDate: '2026-10-11' } },
  { type: 'observacao', attendedAt: at('2026-10-04T15:00:00'), content: { additionalNotes: 'Segundo registro no mesmo dia: contato telefônico para reforçar orientações.' } },
]
for (const r of records) {
  await db.collection('clinicalRecords').add({ ...base, ...r, finalizedAt: FieldValue.serverTimestamp(), searchTokens: [] })
}
console.log('Seed concluído. Entre com profissional@demo.local ou admin@demo.local (senha Demo@12345).')
