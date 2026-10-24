/**
 * Testes das regras de segurança contra o emulador (npm run test:rules).
 * Requer Java 11+ (emulador do Firestore/Storage). Dados totalmente fictícios.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

let env: RulesTestEnvironment

const patient = (over: Record<string, unknown> = {}) => ({
  code: 'PAC-000001',
  fullName: 'Paciente Fictício',
  searchName: 'paciente ficticio',
  birthDate: '1990-01-01',
  sex: 'nao_informado',
  status: 'ativo',
  responsibleUid: 'prof1',
  responsibleName: 'Dra. Um',
  accessUids: ['prof1'],
  createdBy: 'admin1',
  createdAt: Timestamp.now(),
  ...over,
})

const record = (over: Record<string, unknown> = {}) => ({
  patientId: 'p1',
  type: 'evolucao',
  attendedAt: Timestamp.now(),
  createdAt: Timestamp.now(),
  authorUid: 'prof1',
  authorName: 'Dra. Um',
  content: { chiefComplaint: 'Teste' },
  attachments: [],
  version: 1,
  status: 'finalizado',
  amendmentCount: 0,
  accessUids: ['prof1'],
  searchTokens: ['teste'],
  ...over,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-prontuario',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/admin1'), { name: 'Admin', email: 'a@x.com', role: 'admin', active: true })
    await setDoc(doc(db, 'users/prof1'), { name: 'Dra. Um', email: 'p1@x.com', role: 'professional', active: true })
    await setDoc(doc(db, 'users/prof2'), { name: 'Dr. Dois', email: 'p2@x.com', role: 'professional', active: true })
    await setDoc(doc(db, 'users/off'), { name: 'Inativo', email: 'o@x.com', role: 'professional', active: false })
    await setDoc(doc(db, 'patients/p1'), patient())
    await setDoc(doc(db, 'clinicalRecords/r1'), record())
    await setDoc(doc(db, 'clinicalRecords/draft1'), record({ status: 'rascunho' }))
  })
})

describe('autenticação e usuários', () => {
  it('bloqueia visitantes não autenticados em tudo', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'patients/p1')))
    await assertFails(getDoc(doc(db, 'clinicalRecords/r1')))
    await assertFails(getDoc(doc(db, 'users/prof1')))
  })
  it('usuário desativado perde o acesso', async () => {
    const db = env.authenticatedContext('off').firestore()
    await assertFails(getDoc(doc(db, 'patients/p1')))
  })
  it('usuário autenticado sem perfil em /users não acessa nada', async () => {
    const db = env.authenticatedContext('ghost').firestore()
    await assertFails(getDoc(doc(db, 'patients/p1')))
  })
  it('somente administradores criam/alteram usuários', async () => {
    const newUser = { name: 'Novo', email: 'n@x.com', role: 'admin', active: true }
    await assertFails(setDoc(doc(env.authenticatedContext('prof1').firestore(), 'users/prof1'), newUser))
    await assertSucceeds(setDoc(doc(env.authenticatedContext('admin1').firestore(), 'users/novo'), newUser))
  })
})

describe('pacientes', () => {
  it('profissional vê apenas pacientes autorizados', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('prof1').firestore(), 'patients/p1')))
    await assertFails(getDoc(doc(env.authenticatedContext('prof2').firestore(), 'patients/p1')))
  })
  it('lista sem filtro de acesso é negada ao profissional; com array-contains é permitida', async () => {
    const db = env.authenticatedContext('prof2').firestore()
    await assertFails(getDocs(collection(db, 'patients')))
    await assertSucceeds(getDocs(query(collection(db, 'patients'), where('accessUids', 'array-contains', 'prof2'))))
  })
  it('administrador lê tudo; profissional não cria paciente', async () => {
    await assertSucceeds(getDocs(collection(env.authenticatedContext('admin1').firestore(), 'patients')))
    await assertFails(addDoc(collection(env.authenticatedContext('prof1').firestore(), 'patients'), { ...patient(), createdBy: 'prof1', createdAt: serverTimestamp() }))
  })
  it('ninguém exclui pacientes', async () => {
    await assertFails(deleteDoc(doc(env.authenticatedContext('admin1').firestore(), 'patients/p1')))
  })
})

describe('registros clínicos', () => {
  it('consulta por paciente exige o filtro de acesso (accessUids) para profissionais', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    await assertFails(getDocs(query(collection(db, 'clinicalRecords'), where('patientId', '==', 'p1'))))
    await assertSucceeds(getDocs(query(collection(db, 'clinicalRecords'), where('patientId', '==', 'p1'), where('accessUids', 'array-contains', 'prof1'))))
    await assertFails(getDocs(query(collection(db, 'clinicalRecords'), where('patientId', '==', 'p1'), where('accessUids', 'array-contains', 'prof2'))))
  })
  it('só quem tem acesso lê', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('prof1').firestore(), 'clinicalRecords/r1')))
    await assertFails(getDoc(doc(env.authenticatedContext('prof2').firestore(), 'clinicalRecords/r1')))
    await assertSucceeds(getDoc(doc(env.authenticatedContext('admin1').firestore(), 'clinicalRecords/r1')))
  })
  it('profissional autorizado cria registro; carimbo de criação deve ser do servidor', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    await assertSucceeds(setDoc(doc(db, 'clinicalRecords/novo'), record({ createdAt: serverTimestamp() })))
    await assertFails(setDoc(doc(db, 'clinicalRecords/falso'), record({ createdAt: Timestamp.fromDate(new Date('2020-01-01')) })))
  })
  it('profissional não autorizado não cria registro no paciente', async () => {
    const db = env.authenticatedContext('prof2').firestore()
    await assertFails(setDoc(doc(db, 'clinicalRecords/x'), record({ authorUid: 'prof2', createdAt: serverTimestamp(), accessUids: ['prof1'] })))
  })
  it('registro finalizado é imutável e não pode ser excluído', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    await assertFails(updateDoc(doc(db, 'clinicalRecords/r1'), { content: { chiefComplaint: 'adulterado' }, version: 2 }))
    await assertFails(deleteDoc(doc(db, 'clinicalRecords/r1')))
  })
  it('rascunho pode ser editado pelo autor, sem alterar a data de criação', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    await assertSucceeds(updateDoc(doc(db, 'clinicalRecords/draft1'), { content: { chiefComplaint: 'ajustado' }, version: 2 }))
    await assertFails(updateDoc(doc(db, 'clinicalRecords/draft1'), { createdAt: Timestamp.fromDate(new Date('2020-01-01')), version: 3 }))
  })
  it('adendo: cria subdocumento e incrementa contador, sem editar o conteúdo', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    await assertSucceeds(addDoc(collection(db, 'clinicalRecords/r1/amendments'), { kind: 'adendo', reason: 'Complemento', text: 'x', authorUid: 'prof1', authorName: 'Dra. Um', createdAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(db, 'clinicalRecords/r1'), { amendmentCount: 1 }))
    await assertFails(updateDoc(doc(db, 'clinicalRecords/r1'), { amendmentCount: 5 }))
  })
  it('adendos não podem ser editados nem excluídos', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'clinicalRecords/r1/amendments/a1'), { kind: 'adendo', reason: 'Complemento', text: 'x', authorUid: 'prof1', authorName: 'Dra. Um', createdAt: Timestamp.now() })
    })
    const db = env.authenticatedContext('prof1').firestore()
    await assertFails(updateDoc(doc(db, 'clinicalRecords/r1/amendments/a1'), { text: 'y' }))
    await assertFails(deleteDoc(doc(db, 'clinicalRecords/r1/amendments/a1')))
  })
})

describe('relatórios e auditoria', () => {
  const report = (over: Record<string, unknown> = {}) => ({
    groupId: 'g1',
    version: 1,
    number: 'REL-1',
    patientId: 'p1',
    status: 'rascunho',
    sections: [],
    generatedByUid: 'prof1',
    createdAt: serverTimestamp(),
    accessUids: ['prof1'],
    ...over,
  })
  it('relatório final é imutável', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    await assertSucceeds(setDoc(doc(db, 'generatedReports/rep1'), report()))
    await assertSucceeds(updateDoc(doc(db, 'generatedReports/rep1'), { status: 'final', finalizedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, 'generatedReports/rep1'), { title: 'alterado' }))
    await assertFails(deleteDoc(doc(db, 'generatedReports/rep1')))
  })
  it('auditoria é append-only e só administradores leem tudo', async () => {
    const db = env.authenticatedContext('prof1').firestore()
    const log = { action: 'login', entityType: 'sessao', actorUid: 'prof1', actorName: 'Dra. Um', summary: 'Login', createdAt: serverTimestamp() }
    const ref = await assertSucceeds(addDoc(collection(db, 'auditLogs'), log))
    await assertFails(updateDoc(ref, { summary: 'x' }))
    await assertFails(deleteDoc(ref))
    await assertFails(getDocs(collection(db, 'auditLogs')))
    await assertSucceeds(getDocs(collection(env.authenticatedContext('admin1').firestore(), 'auditLogs')))
    await assertFails(addDoc(collection(db, 'auditLogs'), { ...log, actorUid: 'admin1' }))
  })
})
