import { getPatient } from './patientService'
import { listAllPatientRecords, listAmendments } from './recordService'
import { listPatientReports } from './reportService'
import { logAudit } from './auditService'
import { AppError } from '@/lib/errors'
import type { UserProfile } from '@/types'

/**
 * Exporta todos os dados de um paciente (cadastro, registros, adendos e relatórios) em JSON.
 * Atende a pedidos de acesso/portabilidade do titular (LGPD, art. 18) e serve de cópia pontual.
 * O backup completo do banco é feito pelo Firestore (ver docs/BACKUP.md).
 */
export async function exportPatientData(actor: UserProfile, patientId: string): Promise<void> {
  const patient = await getPatient(patientId)
  if (!patient) throw new AppError('Paciente não encontrado ou sem permissão.')
  const records = await listAllPatientRecords(actor, patientId, {}, 10000)
  const withAmendments = await Promise.all(records.map(async (r) => ({ ...r, amendments: r.amendmentCount > 0 ? await listAmendments(r.id) : [] })))
  const reports = await listPatientReports(actor, patientId, 500)
  const payload = { exportedAt: new Date().toISOString(), exportedBy: actor.uid, patient, records: withAmendments, reports }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `exportacao-${patient.code}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  await logAudit(actor, 'dados.exportar', 'paciente', 'Exportação de dados do titular realizada', { patientId })
}
