import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ClipboardPlus, FileText, Pencil, RotateCcw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useRecentPatients } from '@/hooks/useSettings'
import { archivePatient, getPatient, reactivatePatient } from '@/services/patientService'
import { listPatientReports } from '@/services/reportService'
import { logAudit } from '@/services/auditService'
import { calcAge, formatDateTime, formatIsoDate } from '@/lib/date'
import { formatPhone } from '@/lib/text'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/form'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import { Timeline } from '@/components/records/Timeline'
import { cn } from '@/lib/utils'
import { REPORT_KIND_LABEL } from '@/lib/reports/builder'
import type { Patient } from '@/types'

type Tab = 'historico' | 'dados' | 'relatorios'

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="clinical-text mt-0.5 text-sm">{value?.trim() ? value : '—'}</dd>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id = '' } = useParams()
  const user = useProfile()
  const recent = useRecentPatients()
  const patient = useAsync(() => getPatient(id), [id])
  const [tab, setTab] = useState<Tab>('historico')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (patient.data) {
      recent.push(patient.data.id)
      void logAudit(user, 'paciente.visualizar', 'paciente', 'Prontuário do paciente consultado', { entityId: patient.data.id, patientId: patient.data.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.data?.id])

  if (patient.loading) return <Spinner />
  if (patient.error) return <ErrorState message={patient.error} onRetry={patient.reload} />
  const p: Patient | null | undefined = patient.data
  if (!p) return <EmptyState title="Paciente não encontrado" description="O paciente não existe ou você não tem permissão para acessá-lo." action={<Button asChild variant="outline"><Link to="/pacientes">Voltar à lista</Link></Button>} />

  const archived = p.status === 'arquivado'
  const a = p.address
  const address = a && [a.street, a.number, a.complement, a.district, a.city && `${a.city}${a.state ? `/${a.state}` : ''}`, a.zip].filter(Boolean).join(', ')

  const doArchive = async () => {
    setBusy(true)
    try {
      await archivePatient(user, p, reason)
      toast.success('Paciente arquivado. O histórico foi preservado.')
      setArchiveOpen(false)
      setReason('')
      patient.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  const doReactivate = async () => {
    setBusy(true)
    try {
      await reactivatePatient(user, p)
      toast.success('Paciente reativado.')
      patient.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{p.fullName}</h1>
            <Badge variant={archived ? 'muted' : 'success'}>{archived ? 'Arquivado' : 'Ativo'}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.code} · {formatIsoDate(p.birthDate)} ({calcAge(p.birthDate) ?? '—'} anos) · Responsável: {p.responsibleName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!archived && (
            <Button asChild>
              <Link to={`/pacientes/${p.id}/registros/novo`}>
                <ClipboardPlus className="h-4 w-4" /> Novo registro
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={`/relatorios?paciente=${p.id}`}>
              <FileText className="h-4 w-4" /> Gerar relatório
            </Link>
          </Button>
          {user.role === 'admin' && (
            <>
              <Button asChild variant="outline">
                <Link to={`/pacientes/${p.id}/editar`}>
                  <Pencil className="h-4 w-4" /> Editar
                </Link>
              </Button>
              {archived ? (
                <Button variant="outline" onClick={() => void doReactivate()} loading={busy}>
                  <RotateCcw className="h-4 w-4" /> Reativar
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                  <Archive className="h-4 w-4" /> Arquivar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {p.allergies?.trim() && (
        <Alert variant="danger" className="mb-4 flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Alergias conhecidas:</strong> <span className="clinical-text">{p.allergies}</span>
          </span>
        </Alert>
      )}
      {archived && <Alert variant="warning" className="mb-4">Cadastro arquivado{p.archivedReason ? ` — motivo: ${p.archivedReason}` : ''}. Novos registros estão bloqueados; o histórico permanece disponível.</Alert>}

      <div role="tablist" aria-label="Seções do paciente" className="mb-4 flex gap-1 border-b">
        {([['historico', 'Histórico clínico'], ['dados', 'Dados cadastrais'], ['relatorios', 'Relatórios']] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-medium', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'historico' && <Timeline patientId={p.id} />}

      {tab === 'dados' && (
        <Card>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Row label="Sexo" value={{ feminino: 'Feminino', masculino: 'Masculino', outro: 'Outro', nao_informado: 'Não informado' }[p.sex]} />
              <Row label="Telefone" value={formatPhone(p.phone)} />
              <Row label="E-mail" value={p.email} />
              <Row label="Primeiro atendimento" value={p.firstAttendanceDate ? formatIsoDate(p.firstAttendanceDate) : ''} />
              <Row label="Endereço" value={address} />
              <Row label="Responsável legal" value={[p.guardianName, formatPhone(p.guardianPhone)].filter(Boolean).join(' — ')} />
              <Row label="Contato de emergência" value={[p.emergencyContactName, formatPhone(p.emergencyContactPhone)].filter(Boolean).join(' — ')} />
              <Row label="Cadastrado em" value={formatDateTime(p.createdAt)} />
              <div className="sm:col-span-2">
                <Row label="Informações clínicas relevantes" value={p.clinicalInfo} />
              </div>
              <div className="sm:col-span-2">
                <Row label="Observações gerais" value={p.notes} />
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {tab === 'relatorios' && <PatientReports patientId={p.id} />}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Arquivar paciente"
        description="O paciente deixará de aceitar novos registros, mas todo o histórico será preservado e poderá ser consultado. Nada é excluído."
        confirmLabel="Arquivar"
        destructive
        loading={busy}
        onConfirm={doArchive}
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do arquivamento (obrigatório)" aria-label="Motivo do arquivamento" />
      </ConfirmDialog>
    </>
  )
}

function PatientReports({ patientId }: { patientId: string }) {
  const user = useProfile()
  const list = useAsync(() => listPatientReports(user, patientId), [user, patientId])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatórios gerados</CardTitle>
      </CardHeader>
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title="Nenhum relatório gerado" description="Gere um relatório consolidado a partir do histórico deste paciente." action={<Button asChild><Link to={`/relatorios?paciente=${patientId}`}>Gerar relatório</Link></Button>} />
      ) : (
        <ul className="divide-y">
          {list.data.map((r) => (
            <li key={r.id}>
              <Link to={`/relatorios/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-accent/40">
                <span>
                  <span className="block text-sm font-medium">{REPORT_KIND_LABEL[r.kind]}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.number} v{r.version} · {formatDateTime(r.createdAt)} · {r.generatedByName}
                  </span>
                </span>
                <Badge variant={r.status === 'final' ? 'success' : 'warning'}>{r.status === 'final' ? 'Final' : 'Rascunho'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
