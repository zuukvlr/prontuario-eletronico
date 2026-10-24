import type { ContentField, MedicationStatus, RecordType } from '@/types'

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  evolucao: 'Evolução clínica',
  relatorio: 'Relatório',
  laudo: 'Laudo',
  exame: 'Resultado de exame',
  prescricao: 'Prescrição / medicação',
  procedimento: 'Procedimento',
  observacao: 'Observação',
  documento: 'Documento anexado',
  outros: 'Outros',
}

export const RECORD_TYPES = Object.keys(RECORD_TYPE_LABEL) as RecordType[]

export const MEDICATION_STATUS_LABEL: Record<MedicationStatus, string> = {
  prescrito: 'Prescrito',
  administrado: 'Administrado',
}

export const FIELD_LABEL: Record<ContentField, string> = {
  title: 'Título',
  chiefComplaint: 'Queixa principal',
  reportedSymptoms: 'Sintomas relatados pelo paciente',
  observedFindings: 'Sinais e achados observados',
  evolution: 'Evolução do quadro',
  assessment: 'Avaliação do profissional',
  diagnosticHypotheses: 'Hipóteses diagnósticas',
  confirmedDiagnosis: 'Diagnóstico confirmado',
  medications: 'Medicamentos',
  procedures: 'Procedimentos realizados',
  requestedExams: 'Exames solicitados',
  examResults: 'Resultados de exames',
  conduct: 'Conduta adotada',
  guidance: 'Orientações fornecidas',
  followUpPlan: 'Plano de acompanhamento',
  returnDate: 'Data sugerida para retorno',
  additionalNotes: 'Observações adicionais',
}

/** Campos exibidos/impressos, em ordem canônica. */
export const FIELD_ORDER: ContentField[] = [
  'title',
  'chiefComplaint',
  'reportedSymptoms',
  'observedFindings',
  'evolution',
  'assessment',
  'diagnosticHypotheses',
  'confirmedDiagnosis',
  'medications',
  'procedures',
  'requestedExams',
  'examResults',
  'conduct',
  'guidance',
  'followUpPlan',
  'returnDate',
  'additionalNotes',
]

const CLINICAL_CORE: ContentField[] = FIELD_ORDER.filter((f) => f !== 'title')

/** Campos que cada tipo de registro apresenta no formulário. */
export const FIELDS_BY_TYPE: Record<RecordType, ContentField[]> = {
  evolucao: CLINICAL_CORE,
  relatorio: ['title', 'chiefComplaint', 'evolution', 'assessment', 'confirmedDiagnosis', 'conduct', 'guidance', 'followUpPlan', 'returnDate', 'additionalNotes'],
  laudo: ['title', 'observedFindings', 'assessment', 'diagnosticHypotheses', 'confirmedDiagnosis', 'conduct', 'additionalNotes'],
  exame: ['title', 'requestedExams', 'examResults', 'assessment', 'conduct', 'additionalNotes'],
  prescricao: ['assessment', 'medications', 'guidance', 'followUpPlan', 'returnDate', 'additionalNotes'],
  procedimento: ['title', 'procedures', 'observedFindings', 'assessment', 'conduct', 'guidance', 'followUpPlan', 'returnDate', 'additionalNotes'],
  observacao: ['title', 'additionalNotes'],
  documento: ['title', 'additionalNotes'],
  outros: ['title', 'chiefComplaint', 'evolution', 'conduct', 'additionalNotes'],
}

/** Ao menos um destes campos deve estar preenchido para o tipo. */
export const REQUIRED_ANY_BY_TYPE: Record<RecordType, ContentField[]> = {
  evolucao: ['chiefComplaint', 'reportedSymptoms', 'observedFindings', 'evolution', 'assessment', 'conduct'],
  relatorio: ['evolution', 'assessment', 'conduct', 'additionalNotes'],
  laudo: ['observedFindings', 'assessment', 'confirmedDiagnosis'],
  exame: ['examResults', 'requestedExams'],
  prescricao: ['medications'],
  procedimento: ['procedures'],
  observacao: ['additionalNotes'],
  documento: ['title'],
  outros: ['additionalNotes', 'evolution', 'conduct'],
}

export const TEXTAREA_FIELDS: ContentField[] = [
  'chiefComplaint',
  'reportedSymptoms',
  'observedFindings',
  'evolution',
  'assessment',
  'diagnosticHypotheses',
  'confirmedDiagnosis',
  'procedures',
  'requestedExams',
  'examResults',
  'conduct',
  'guidance',
  'followUpPlan',
  'additionalNotes',
]
