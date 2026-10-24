import { z } from 'zod'
import { isValidIsoDate, todayIso } from '@/lib/date'
import { digitsOnly } from '@/lib/text'
import { storageEnabled } from '@/lib/features'
import { REQUIRED_ANY_BY_TYPE } from '@/lib/recordTypes'
import type { ClinicalContent, RecordType } from '@/types'

const optionalText = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres`).optional().or(z.literal(''))

const isoDate = z
  .string()
  .refine((v) => isValidIsoDate(v), 'Data inválida')

const optionalIsoDate = z
  .string()
  .optional()
  .refine((v) => !v || isValidIsoDate(v), 'Data inválida')

const phone = z
  .string()
  .optional()
  .refine((v) => !v || [10, 11].includes(digitsOnly(v).length), 'Telefone inválido (use DDD + número)')

export const patientSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe o nome completo').max(160),
    birthDate: isoDate.refine((v) => v <= todayIso(), 'A data de nascimento não pode ser futura').refine((v) => v >= '1900-01-01', 'Data de nascimento inválida'),
    sex: z.enum(['feminino', 'masculino', 'outro', 'nao_informado']),
    phone,
    email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
    street: optionalText(160),
    number: optionalText(20),
    complement: optionalText(80),
    district: optionalText(80),
    city: optionalText(80),
    state: z.string().trim().max(2, 'Use a sigla (UF)').optional().or(z.literal('')),
    zip: z.string().optional().refine((v) => !v || digitsOnly(v).length === 8, 'CEP inválido'),
    guardianName: optionalText(160),
    guardianPhone: phone,
    emergencyContactName: optionalText(160),
    emergencyContactPhone: phone,
    firstAttendanceDate: optionalIsoDate,
    responsibleUid: z.string().min(1, 'Selecione o profissional responsável'),
    extraAccessUids: z.array(z.string()).default([]),
    allergies: optionalText(4000),
    clinicalInfo: optionalText(8000),
    notes: optionalText(8000),
  })
  .superRefine((v, ctx) => {
    const birth = new Date(`${v.birthDate}T12:00:00Z`)
    const age = (Date.now() - birth.getTime()) / (365.25 * 86400000)
    if (age < 18 && !v.guardianName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'Paciente menor de idade: informe o responsável legal' })
    }
  })

export type PatientFormValues = z.infer<typeof patientSchema>

export const medicationSchema = z.object({
  name: z.string().trim().min(2, 'Informe o medicamento').max(160),
  dose: optionalText(80),
  route: optionalText(60),
  frequency: optionalText(80),
  status: z.enum(['prescrito', 'administrado']),
})

const longText = optionalText(8000)

export const clinicalContentSchema = z.object({
  title: optionalText(200),
  chiefComplaint: longText,
  reportedSymptoms: longText,
  observedFindings: longText,
  evolution: longText,
  assessment: longText,
  diagnosticHypotheses: longText,
  confirmedDiagnosis: longText,
  medications: z.array(medicationSchema).max(40).optional(),
  procedures: longText,
  requestedExams: longText,
  examResults: longText,
  conduct: longText,
  guidance: longText,
  followUpPlan: longText,
  returnDate: optionalIsoDate,
  additionalNotes: longText,
})

export const recordSchema = z.object({
  type: z.enum(['evolucao', 'relatorio', 'laudo', 'exame', 'prescricao', 'procedimento', 'observacao', 'documento', 'outros']),
  attendedAt: z.string().min(1, 'Informe a data e a hora do atendimento'),
  content: clinicalContentSchema,
})

export type RecordFormValues = z.infer<typeof recordSchema>

/** Verifica se o conteúdo atende ao mínimo exigido pelo tipo de registro. Retorna mensagem de erro ou null. */
export function validateRecordContent(type: RecordType, content: ClinicalContent, hasAttachments: boolean): string | null {
  const required = REQUIRED_ANY_BY_TYPE[type]
  const filled = required.some((f) => {
    const v = content[f]
    if (Array.isArray(v)) return v.some((m) => m.name?.trim())
    return typeof v === 'string' && v.trim().length > 0
  })
  if (type === 'documento' && storageEnabled && !hasAttachments) return 'Anexe ao menos um documento.'
  if (!filled) return 'Preencha ao menos um dos campos principais deste tipo de registro.'
  return null
}

export const amendmentSchema = z
  .object({
    kind: z.enum(['adendo', 'retificacao']),
    reason: z.string().trim().min(5, 'Informe o motivo (mínimo de 5 caracteres)').max(2000),
    text: z.string().trim().min(1, 'Informe o texto').max(8000),
    field: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'retificacao' && !v.field) ctx.addIssue({ code: 'custom', path: ['field'], message: 'Selecione o campo a retificar' })
  })

export const userSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome').max(120),
  email: z.string().trim().email('E-mail inválido'),
  role: z.enum(['admin', 'professional']),
  registration: optionalText(60),
  specialty: optionalText(80),
})

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})
