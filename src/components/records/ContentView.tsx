import { FIELD_LABEL, FIELD_ORDER, MEDICATION_STATUS_LABEL } from '@/lib/recordTypes'
import { formatIsoDate } from '@/lib/date'
import { Badge } from '@/components/ui/misc'
import type { ClinicalContent, ContentField } from '@/types'

/** Exibe o conteúdo clínico com rótulos, preservando quebras de linha. */
export function ContentView({ content, only }: { content: ClinicalContent; only?: ContentField[] }) {
  const fields = FIELD_ORDER.filter((f) => !only || only.includes(f))
  const rows = fields.filter((f) => {
    const v = content[f]
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0
  })
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sem conteúdo textual neste registro.</p>
  return (
    <dl className="space-y-3">
      {rows.map((f) => (
        <div key={f}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FIELD_LABEL[f]}</dt>
          <dd className="mt-0.5 text-sm">
            {f === 'medications' ? (
              <ul className="space-y-1">
                {(content.medications ?? []).map((m, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <strong>{m.name}</strong>
                    <span className="text-muted-foreground">{[m.dose && `dose ${m.dose}`, m.route && `via ${m.route}`, m.frequency && m.frequency].filter(Boolean).join(' · ')}</span>
                    <Badge variant={m.status === 'administrado' ? 'success' : 'default'}>{MEDICATION_STATUS_LABEL[m.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : f === 'returnDate' ? (
              formatIsoDate(content.returnDate)
            ) : (
              <p className="clinical-text">{content[f] as string}</p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
