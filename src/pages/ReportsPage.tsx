import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, FileText, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useSettings } from '@/hooks/useSettings'
import { getPatient } from '@/services/patientService'
import { listReports } from '@/services/reportService'
import { generateReport, type GenerationMode } from '@/services/reportGenerator'
import { DETAIL_LABEL, REPORT_KIND_LABEL } from '@/lib/reports/builder'
import { RECORD_TYPES, RECORD_TYPE_LABEL } from '@/lib/recordTypes'
import { formatDateTime, formatIsoDate } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/misc'
import { PatientPicker } from '@/components/patients/PatientPicker'
import type { DetailLevel, Patient, RecordType, ReportKind } from '@/types'

export default function ReportsPage() {
  const user = useProfile()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { settings } = useSettings()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [kind, setKind] = useState<ReportKind>('completo')
  const [detail, setDetail] = useState<DetailLevel>('padrao')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [types, setTypes] = useState<RecordType[]>([])
  const [mode, setMode] = useState<GenerationMode>('padrao')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useAsync(() => listReports(user), [user.uid])

  const preId = params.get('paciente')
  useEffect(() => {
    if (preId) getPatient(preId).then((p) => p && setPatient(p)).catch((e) => setError(friendlyError(e)))
  }, [preId])

  const needsPeriod = kind === 'periodo'
  const needsTypes = kind === 'por_tipo'

  const submit = async () => {
    if (!patient) return setError('Selecione um paciente.')
    if (needsPeriod && !from && !to) return setError('Informe ao menos uma data para o relatório de período.')
    if (needsTypes && types.length === 0) return setError('Selecione ao menos um tipo de registro.')
    if (from && to && from > to) return setError('A data inicial não pode ser posterior à final.')
    setError(null)
    setBusy(true)
    try {
      const id = await generateReport(user, { patient, kind, detail, periodFrom: from || undefined, periodTo: to || undefined, types, mode })
      toast.success('Rascunho gerado. Revise o conteúdo antes de finalizar.')
      navigate(`/relatorios/${id}`)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Relatórios" description="Consolide o histórico clínico em um documento cronológico, revise e exporte em PDF." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Novo relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">Paciente</p>
            {patient ? (
              <div className="flex items-center gap-2">
                <Badge>{patient.fullName} ({patient.code})</Badge>
                <Button size="sm" variant="ghost" onClick={() => setPatient(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <PatientPicker onSelect={setPatient} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de relatório" htmlFor="r-kind">
              <Select id="r-kind" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
                {Object.entries(REPORT_KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nível de detalhamento" htmlFor="r-detail">
              <Select id="r-detail" value={detail} onChange={(e) => setDetail(e.target.value as DetailLevel)}>
                {Object.entries(DETAIL_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Período — de" htmlFor="r-from" hint="Deixe em branco para todo o histórico.">
              <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Período — até" htmlFor="r-to">
              <Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Tipos de registro {needsTypes ? '(obrigatório)' : '(opcional — vazio = todos)'}</legend>
            <div className="flex flex-wrap gap-2">
              {RECORD_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="checkbox" className="sr-only" checked={types.includes(t)} onChange={() => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} />
                  {RECORD_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">Como redigir o relatório</legend>
            {([
              ['padrao', 'Consolidação automática (sem IA)', 'Reorganiza o que está registrado, com regras fixas. Não inventa nada. Sempre disponível.', true],
              ['ia_local', 'IA local (Ollama neste computador)', 'Os dados não saem do computador. Exige o Ollama instalado e liberado (veja Configurações). O texto passa por verificação automática.', settings.aiLocalEnabled],
              ['ia_nuvem', 'IA em nuvem (Cloud Function)', 'Envia os registros, sem nome do paciente, ao provedor de IA configurado. Exige contrato e avaliação de LGPD (docs/IA.md).', settings.aiEnabled],
            ] as const).map(([value, label, hint, enabled]) => (
              <label key={value} className={`flex items-start gap-3 text-sm ${enabled ? '' : 'opacity-50'}`}>
                <input type="radio" name="mode" className="mt-1 h-4 w-4" disabled={!enabled} checked={mode === value} onChange={() => setMode(value)} />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {value !== 'padrao' && <Bot className="h-4 w-4" aria-hidden />} {label}
                    {!enabled && <Badge variant="muted">desabilitada pelo administrador</Badge>}
                  </span>
                  <span className="block text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
            {mode !== 'padrao' && <p className="text-xs text-muted-foreground">O resultado é sempre um rascunho: você revisa e aprova antes de ele valer como documento.</p>}
          </fieldset>

          {error && <Alert variant="danger">{error}</Alert>}
          <Button onClick={() => void submit()} loading={busy}>
            <Wand2 className="h-4 w-4" /> Gerar rascunho do relatório
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relatórios recentes</CardTitle>
        </CardHeader>
        {list.loading ? (
          <Spinner />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.data?.length ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum relatório ainda" description="Os relatórios gerados aparecem aqui, com todas as versões." />
        ) : (
          <ul className="divide-y">
            {list.data.map((r) => (
              <li key={r.id}>
                <Link to={`/relatorios/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-accent/40">
                  <span>
                    <span className="block text-sm font-medium">
                      {r.patientName} — {REPORT_KIND_LABEL[r.kind]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.number} v{r.version} · {formatDateTime(r.createdAt)} · {r.generatedByName}
                      {r.periodFrom || r.periodTo ? ` · ${formatIsoDate(r.periodFrom)} a ${formatIsoDate(r.periodTo)}` : ''}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    {r.origin === 'ia' && <Badge variant="muted">IA</Badge>}
                    <Badge variant={r.status === 'final' ? 'success' : 'warning'}>{r.status === 'final' ? 'Final' : 'Rascunho'}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
