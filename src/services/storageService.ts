import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'
import { logAudit } from './auditService'
import { AppError } from '@/lib/errors'
import type { Attachment, UserProfile } from '@/types'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

export function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return `Tipo de arquivo não permitido (${file.name}). Use PDF, imagem, DOCX, XLSX ou TXT.`
  if (file.size > MAX_FILE_BYTES) return `O arquivo ${file.name} excede 10 MB.`
  if (file.size === 0) return `O arquivo ${file.name} está vazio.`
  return null
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120)
}

/** Envia o anexo para patients/{patientId}/{recordId}/{timestamp}-{nome}. Os arquivos não são sobrescritos nem apagados. */
export async function uploadAttachment(actor: UserProfile, patientId: string, recordId: string, file: File): Promise<Attachment> {
  const err = validateFile(file)
  if (err) throw new AppError(err)
  const path = `patients/${patientId}/${recordId}/${Date.now()}-${safeName(file.name)}`
  await uploadBytes(ref(storage, path), file, { contentType: file.type })
  await logAudit(actor, 'anexo.enviar', 'anexo', 'Anexo enviado', { entityId: recordId, patientId })
  return { name: file.name, path, contentType: file.type, size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: actor.uid }
}

/** Gera URL temporária de download (exige estar autorizado nas regras do Storage). */
export async function openAttachment(actor: UserProfile, patientId: string, a: Attachment): Promise<void> {
  const url = await getDownloadURL(ref(storage, a.path))
  await logAudit(actor, 'anexo.baixar', 'anexo', 'Anexo aberto', { patientId })
  window.open(url, '_blank', 'noopener,noreferrer')
}
