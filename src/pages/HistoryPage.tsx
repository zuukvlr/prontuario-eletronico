import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { searchRecords, type CrossSearch } from '@/services/recordService'
import { listUsers } from '@/services/userService'
import { getPatient } from '@/services/patientService'
import { friendlyError } from '@/lib/errors'
import { formatDateTime } from '@/lib/date'
import { RECORD_TYPES, RECORD_TYPE_LABEL } from '@/lib/recordTypes'
import { recordCode, truncate } from '@/lib/text'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Alert, Badge, Card, CardContent, EmptyState, ErrorState, PageHeader } from '@/components/ui/misc'
import { PatientPicker } from '@/components/patients/PatientPicker'
import type { ClinicalRecord, Patient, RecordType } from '@/types'

/** Histórico clínico + pesquisa avançada nos registros autorizados. */
export default function HistoryPage() {
  const user = useProfile()
  const professionals = useAsync(() => (user.role === 'admin' ? listUsers() : Promise.resolve([])), [user.role])
  const [patient, setPatient] = useState<Patient | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [f, setF] = useState<CrossSearch>({ patientStatus: 'todos' })
  const [results, setResults] = useState<ClinicalRecord[] | null>(null)
  const [pmap, setPmap] = useState<Record<string, Patient>>({})
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [scanned, setScanned] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolveNames = async (items: ClinicalRecord[]) => {
    const missing = [...new Set(items.map((r) => r.patientId))].filter((id) => !pmap[id])
    const fetched = await Promise.all(missing.map((id) => getPatient(id).catch(() => null)))
    setPmap((n) => ({ ...n, ...Object.fromEntries(fetched.filter((p): p is Patient => !!p).map((p) => [p.id, p])) }))
  }

  const run = async (more = false) => {
    setLoading(true)
    setError(null)
    try {
      const r = await searchRecords(user, { ...f, patientId: patient?.id }, more ? cursor : null)
      const merged = more ? [...(results ?? []), ...r.items] : r.items
      setResults(merged)
      setCursor(r.cursor)
      setScanned((s) => (more ? s + r.scanned : r.scanned))
      await resolveNames(r.items)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }

  const visible = (results ?? []).filter((r) => !f.patientStatus || f.patientStatus === 'todos' || pmap[r.patientId]?.status === f.patientStatus)
  const toggleType = (t: RecordType) => setF((x) => ({ ...x, types: x.types?.includes(t) ? x.types.filter((y) => y !== t) : [...(x.types ?? []), t] }))

  return (
    <>
      <PageHeader title="Histórico clínico" description="Pesquise nos registros que você tem permissão de acessar. Abra um resultado para ver o registro original." />
      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="mb-1.5 text-sm font-medium">Paciente</p>
              {patient ? (
                <div className="flex items-center gap-2">
                  <Badge>{patient.fullName} ({patient.code})</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setPatient(null)}>
                    Limpar
                  </Button>
                </div>
              ) : pickOpen ? (
                <PatientPicker autoFocus onSelect={(p) => { setPatient(p); setPickOpen(false) }} />
              ) : (
                <Button variant="outline" size="sm" onClick={() => setPickOpen(true)}>
                  Filtrar por paciente (nome ou identificador)
                </Button>
              )}
            </div>
            <Field label="Data inicial" htmlFor="h-from">
              <Input id="h-from" type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
            </Field>
            <Field label="Data final" htmlFor="h-to">
              <Input id="h-to" type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
            </Field>
            {user.role === 'admin' && (
              <Field label="Profissional responsável pelo registro" htmlFor="h-author">
                <Select id="h-author" value={f.authorUid ?? ''} onChange={(e) => setF({ ...f, authorUid: e.target.value || undefined })}>
                  <option value="">Todos</option>
                  {professionals.data?.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Medicamento mencionado" htmlFor="h-med">
              <Input id="h-med" value={f.medication ?? ''} onChange={(e) => setF({ ...f, medication: e.target.value })} />
            </Field>
            <Field label="Sintoma registrado" htmlFor="h-sym">
              <Input id="h-sym" value={f.symptom ?? ''} onChange={(e) => setF({ ...f, symptom: e.target.value })} />
            </Field>
            <Field label="Status do paciente" htmlFor="h-pst">
              <Select id="h-pst" value={f.patientStatus ?? 'todos'} onChange={(e) => setF({ ...f, patientStatus: e.target.value as CrossSearch['patientStatus'] })}>
                <option value="todos">Todos</option>
                <option value="ativo">Ativos</option>
                <option value="arquivado">Arquivados</option>
              </Select>
            </Field>
            <Field label="Termo livre (em qualquer campo)" htmlFor="h-term">
              <Input id="h-term" value={f.term ?? ''} onChange={(e) => setF({ ...f, term: e.target.value })} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Tipos de registro</legend>
            <div className="flex flex-wrap gap-2">
              {RECORD_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="checkbox" className="sr-only" checked={f.types?.includes(t) ?? false} onChange={() => toggleType(t)} />
                  {RECORD_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <Button onClick={() => void run()} loading={loading && !results}>
            <Search className="h-4 w-4" /> Pesquisar
          </Button>
        </CardContent>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void run()} />}
      {results && !error && (
        <Card>
          {visible.length === 0 ? (
            <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros. A pesquisa considera somente os registros aos quais você tem acesso." />
          ) : (
            <ul className="divide-y">
              {visible.map((r) => (
                <li key={r.id}>
                  <Link to={`/registros/${r.id}`} className="block px-5 py-3 hover:bg-accent/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{RECORD_TYPE_LABEL[r.type]}</Badge>
                      <span className="text-sm font-medium">{pmap[r.patientId] ? `${pmap[r.patientId].fullName} (${pmap[r.patientId].code})` : 'Paciente'}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{recordCode(r.id)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(r.attendedAt)} · {r.authorName}
                    </p>
                    <p className="clinical-text mt-1 text-sm">{truncate(r.content.chiefComplaint || r.content.title || r.content.assessment || r.content.additionalNotes || '', 200)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 border-t p-4 text-center">
            <p className="text-xs text-muted-foreground">
              {visible.length} resultado(s) em {scanned} registro(s) analisados.
            </p>
            {cursor && (
              <>
                <Alert variant="info" className="text-left">Há mais registros no período. Os filtros de texto são aplicados sobre os registros carregados; carregue mais para continuar a busca.</Alert>
                <Button variant="outline" onClick={() => void run(true)} loading={loading}>
                  Analisar mais registros
                </Button>
              </>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
