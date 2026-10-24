export type Role = 'admin' | 'professional'

export interface UserProfile {
  uid: string
  name: string
  email: string
  role: Role
  active: boolean
  /** Registro profissional (ex.: CRM-SP 123456). */
  registration?: string
  specialty?: string
  createdAt?: Date
}

export type PatientStatus = 'ativo' | 'arquivado'
export type Sex = 'feminino' | 'masculino' | 'outro' | 'nao_informado'

export interface Address {
  street?: string
  number?: string
  complement?: string
  district?: string
  city?: string
  state?: string
  zip?: string
}

export interface Patient {
  id: string
  /** Identificador interno legível, gerado automaticamente (PAC-000001). */
  code: string
  fullName: string
  /** Nome normalizado (minúsculo, sem acentos) usado em buscas por prefixo. */
  searchName: string
  birthDate: string // YYYY-MM-DD
  sex: Sex
  phone?: string
  email?: string
  address?: Address
  guardianName?: string
  guardianPhone?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  firstAttendanceDate?: string // YYYY-MM-DD
  responsibleUid: string
  responsibleName: string
  /** Profissionais com acesso (inclui o responsável). Administradores têm acesso a todos. */
  accessUids: string[]
  allergies?: string
  clinicalInfo?: string
  notes?: string
  status: PatientStatus
  archivedReason?: string
  createdAt?: Date
  createdBy?: string
  updatedAt?: Date
  updatedBy?: string
}

export type RecordType =
  | 'evolucao'
  | 'relatorio'
  | 'laudo'
  | 'exame'
  | 'prescricao'
  | 'procedimento'
  | 'observacao'
  | 'documento'
  | 'outros'

export type MedicationStatus = 'prescrito' | 'administrado'

export interface Medication {
  name: string
  dose?: string
  route?: string
  frequency?: string
  status: MedicationStatus
}

export interface ClinicalContent {
  title?: string
  chiefComplaint?: string
  reportedSymptoms?: string
  observedFindings?: string
  evolution?: string
  assessment?: string
  diagnosticHypotheses?: string
  confirmedDiagnosis?: string
  medications?: Medication[]
  procedures?: string
  requestedExams?: string
  examResults?: string
  conduct?: string
  guidance?: string
  followUpPlan?: string
  returnDate?: string // YYYY-MM-DD
  additionalNotes?: string
}

export type ContentField = keyof ClinicalContent

export interface Attachment {
  name: string
  path: string
  contentType: string
  size: number
  uploadedAt: string // ISO
  uploadedBy: string
}

export type RecordStatus = 'rascunho' | 'finalizado'

export interface ClinicalRecord {
  id: string
  patientId: string
  type: RecordType
  /** Quando o atendimento ocorreu (informado pelo profissional). */
  attendedAt: Date
  /** Quando o registro foi inserido no sistema (carimbo do servidor, imutável). */
  createdAt: Date
  authorUid: string
  authorName: string
  authorRegistration?: string
  content: ClinicalContent
  attachments: Attachment[]
  version: number
  status: RecordStatus
  finalizedAt?: Date
  amendmentCount: number
  accessUids: string[]
  searchTokens: string[]
}

export interface Amendment {
  id: string
  recordId: string
  kind: 'adendo' | 'retificacao'
  reason: string
  /** Texto do adendo, ou novo valor do campo retificado. */
  text: string
  field?: ContentField
  previousValue?: string
  authorUid: string
  authorName: string
  createdAt: Date
}

export type ReportKind =
  | 'completo'
  | 'resumo'
  | 'periodo'
  | 'por_tipo'
  | 'medicamentos'
  | 'exames'
  | 'linha_do_tempo'
  | 'encaminhamento'

export type DetailLevel = 'resumido' | 'padrao' | 'detalhado'
export type ReportOrigin = 'local' | 'ia'
export type ReportStatus = 'rascunho' | 'final'

export interface ReportSection {
  id: string
  title: string
  body: string
  /** IDs dos registros clínicos de origem. */
  refs: string[]
}

export interface GeneratedReport {
  id: string
  /** Agrupa todas as versões do mesmo relatório. */
  groupId: string
  version: number
  parentId?: string
  number: string
  patientId: string
  patientName: string
  patientCode: string
  kind: ReportKind
  title: string
  periodFrom?: string // YYYY-MM-DD
  periodTo?: string
  recordTypes: RecordType[]
  detail: DetailLevel
  origin: ReportOrigin
  aiModel?: string
  sections: ReportSection[]
  warnings: string[]
  professionalNotes: string
  sourceRecordIds: string[]
  status: ReportStatus
  generatedByUid: string
  generatedByName: string
  generatedByRegistration?: string
  createdAt: Date
  finalizedAt?: Date
  finalizedByName?: string
  contentHash?: string
  accessUids: string[]
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'paciente.criar'
  | 'paciente.editar'
  | 'paciente.arquivar'
  | 'paciente.reativar'
  | 'paciente.visualizar'
  | 'registro.criar'
  | 'registro.finalizar'
  | 'registro.visualizar'
  | 'registro.adendo'
  | 'relatorio.gerar'
  | 'relatorio.finalizar'
  | 'relatorio.nova_versao'
  | 'relatorio.exportar'
  | 'usuario.criar'
  | 'usuario.editar'
  | 'configuracao.editar'
  | 'anexo.enviar'
  | 'anexo.baixar'
  | 'dados.exportar'

export interface AuditLog {
  id: string
  action: AuditAction
  entityType: 'sessao' | 'paciente' | 'registro' | 'relatorio' | 'usuario' | 'configuracao' | 'anexo'
  entityId?: string
  patientId?: string
  actorUid: string
  actorName: string
  /** Resumo SEM conteúdo clínico. */
  summary: string
  createdAt: Date
}

export interface AppSettings {
  clinicName: string
  clinicDocument?: string
  clinicAddress?: string
  /** IA em nuvem (Cloud Function). */
  aiEnabled: boolean
  /** IA local (Ollama nas máquinas da clínica). */
  aiLocalEnabled: boolean
  aiModel: string
  retentionYears: number
}
