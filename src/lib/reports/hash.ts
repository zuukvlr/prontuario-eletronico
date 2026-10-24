import type { GeneratedReport } from '@/types'

/** Conteúdo que entra no hash de integridade de um relatório finalizado. */
export function canonicalReportPayload(r: Pick<GeneratedReport, 'number' | 'version' | 'patientId' | 'title' | 'periodFrom' | 'periodTo' | 'sections' | 'professionalNotes' | 'sourceRecordIds' | 'origin'>): string {
  return JSON.stringify({
    number: r.number,
    version: r.version,
    patientId: r.patientId,
    title: r.title,
    periodFrom: r.periodFrom ?? null,
    periodTo: r.periodTo ?? null,
    origin: r.origin,
    sections: r.sections.map((s) => ({ title: s.title, body: s.body, refs: s.refs })),
    notes: r.professionalNotes,
    sources: [...r.sourceRecordIds].sort(),
  })
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function reportHash(r: Parameters<typeof canonicalReportPayload>[0]): Promise<string> {
  return sha256Hex(canonicalReportPayload(r))
}
