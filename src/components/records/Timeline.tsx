import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownUp, Paperclip } from 'lucide-react'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { useProfile } from '@/context/AuthContext'
import { listPatientRecords } from '@/services/recordService'
import { friendlyError } from '@/lib/errors'
import { formatDate, formatTime, toIsoDate } from '@/lib/date'
import { RECORD_TYPE_LABEL, RECORD_TYPES } from '@/lib/recordTypes'
import { recordCode, truncate } from '@/lib/text'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import type { ClinicalRecord, RecordType } from '@/types'

function summaryOf(r: ClinicalRecord): string {
  const c = r.content
  const first = c.chiefComplaint || c.title || c.assessment || c.procedures || c.examResults || c.additionalNotes || c.evolution || (c.medications?.length ? `Medicação: ${c.medications.map((m) => m.name).join(', ')}` : '')
  return first ? truncate(first, 220) : 'Sem resumo textual.'
}

/** Linha do tempo clínica: ordenada pela data do atendimento, com paginação. Vários registros por dia são agrupados. */
export function Timeline({ patientId }: { patientId: string }) {
  const user = useProfile()
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<RecordType | ''>('')
  const [items, setItems] = useState<ClinicalRecord[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await listPatientRecords(user, patientId, { from: from || undefined, to: to || undefined, order })
      setItems(p.items)
      setCursor(p.cursor)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [user, patientId, from, to, order])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (!cursor) return
    setMore(true)
    try {
      const p = await listPatientRecords(user, patientId, { from: from || undefined, to: to || undefined, order }, cursor)
      setItems((x) => [...x, ...p.items])
      setCursor(p.cursor)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setMore(false)
    }
  }

  const shown = type ? items.filter((r) => r.type === type) : items
  const groups = new Map<string, ClinicalRecord[]>()
  shown.forEach((r) => {
    const k = toIsoDate(r.attendedAt)
    groups.set(k, [...(groups.get(k) ?? []), r])
  })

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
        <Select value={type} onChange={(e) => setType(e.target.value as RecordType | '')} aria-label="Tipo de registro">
          <option value="">Todos os tipos</option>
          {RECORD_TYPES.map((t) => (
            <option key={t} value={t}>
              {RECORD_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Button variant="outline" onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}>
          <ArrowDownUp className="h-4 w-4" /> {order === 'desc' ? 'Mais recentes' : 'Mais antigos'}
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : shown.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Registre a primeira evolução ou ajuste os filtros de período e tipo." />
      ) : (
        <ol className="relative space-y-6 border-l-2 border-border pl-6">
          {[...groups.entries()].map(([day, list]) => (
            <li key={day}>
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" aria-hidden />
              <h3 className="mb-2 text-sm font-semibold">
                {formatDate(list[0].attendedAt)} <span className="font-normal text-muted-foreground">· {list.length} registro(s)</span>
              </h3>
              <ul className="space-y-2">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link to={`/registros/${r.id}`} className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{RECORD_TYPE_LABEL[r.type]}</Badge>
                        <span className="text-sm font-medium">{formatTime(r.attendedAt)}</span>
                        <span className="text-xs text-muted-foreground">{r.authorName}</span>
                        {r.status === 'rascunho' && <Badge variant="warning">Rascunho</Badge>}
                        {r.amendmentCount > 0 && <Badge variant="muted">{r.amendmentCount} adendo(s)</Badge>}
                        {r.attachments.length > 0 && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Possui anexos" />}
                        <span className="ml-auto text-xs text-muted-foreground">{recordCode(r.id)}</span>
                      </div>
                      <p className="clinical-text mt-2 text-sm text-foreground/90">{summaryOf(r)}</p>
                      {toIsoDate(r.attendedAt) !== toIsoDate(r.createdAt) && <p className="mt-1 text-xs text-warning">Inserido no sistema em {formatDate(r.createdAt)} (data diferente do atendimento).</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {cursor && !loading && (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => void loadMore()} loading={more}>
            Carregar registros mais {order === 'desc' ? 'antigos' : 'recentes'}
          </Button>
        </div>
      )}
    </div>
  )
}
