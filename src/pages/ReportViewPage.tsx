import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Download, Pencil, Printer, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useSettings } from '@/hooks/useSettings'
import { auditExport, createReportDraft, discardDraft, finalizeReport, getReport, listPatientReports, saveReportDraft } from '@/services/reportService'
import { getPatient } from '@/services/patientService'
import { getRecord } from '@/services/recordService'
import { generateReport } from '@/services/reportGenerator'
import { downloadPdf } from '@/lib/reports/pdf'
import { friendlyError } from '@/lib/errors'
import { formatDateTime } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import { ReportDocument } from '@/components/reports/ReportDocument'
import type { ClinicalRecord, ReportSection } from '@/types'

export default function ReportViewPage() {
  const { id = '' } = useParams()
  const user = useProfile()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const report = useAsync(() => getReport(id), [id])
  const versions = useAsync(async () => (report.data ? (await listPatientReports(user, report.data.patientId)).filter((r) => r.groupId === report.data?.groupId) : []), [report.data?.groupId])
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState<ReportSection[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const r = report.data
  useEffect(() => {
    if (r) {
      setTitle(r.title)
      setSections(r.sections)
      setNotes(r.professionalNotes)
      setEditing(false)
    }
  }, [r])

  if (report.loading) return <Spinner />
  if (report.error) return <ErrorState message={report.error} onRetry={report.reload} />
  if (!r) return <EmptyState title="Relatório não encontrado" description="O relatório não existe ou você não tem permissão." />

  const isDraft = r.status === 'rascunho'
  const canEdit = isDraft && r.generatedByUid === user.uid
  const current = { title, sections, professionalNotes: notes }

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const sourceRecords = async (): Promise<ClinicalRecord[]> => (await Promise.all(r.sourceRecordIds.map((x) => getRecord(x).catch(() => null)))).filter((x): x is ClinicalRecord => !!x)

  const doPdf = () =>
    run('pdf', async () => {
      const shown = { ...r, ...(editing || isDraft ? current : {}) }
      downloadPdf(shown, { clinicName: settings.clinicName, sourceRecords: await sourceRecords() })
      await auditExport(user, r, 'pdf')
    })

  const doPrint = () => {
    void auditExport(user, r, 'impressao')
    window.print()
  }

  const doNewVersion = () =>
    run(
      'newv',
      async () => {
        const patient = await getPatient(r.patientId)
        if (!patient) throw new Error('[app] Paciente não encontrado.')
        const newId = await createReportDraft(user, { patient, kind: r.kind, title: r.title, periodFrom: r.periodFrom, periodTo: r.periodTo, recordTypes: r.recordTypes, detail: r.detail, origin: r.origin, aiModel: r.aiModel, sections: r.sections, warnings: r.warnings, sourceRecordIds: r.sourceRecordIds }, r)
        navigate(`/relatorios/${newId}`)
      },
      `Nova versão criada como rascunho. A versão ${r.version} permanece preservada.`,
    )

  const doReconsolidate = () =>
    run(
      'recon',
      async () => {
        const patient = await getPatient(r.patientId)
        if (!patient) throw new Error('[app] Paciente não encontrado.')
        const newId = await generateReport(user, { patient, kind: r.kind, detail: r.detail, periodFrom: r.periodFrom, periodTo: r.periodTo, types: r.recordTypes, mode: 'padrao' }, r)
        navigate(`/relatorios/${newId}`)
      },
      'Nova versão consolidada com os registros atuais.',
    )

  return (
    <>
      <div className="no-print mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{r.number}</h1>
            <Badge variant="muted">v{r.version}</Badge>
            <Badge variant={r.status === 'final' ? 'success' : 'warning'}>{r.status === 'final' ? 'Finalizado' : 'Rascunho'}</Badge>
            {r.origin === 'ia' && <Badge variant="muted">Gerado com IA</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link to={`/pacientes/${r.patientId}`} className="text-primary hover:underline">
              {r.patientName}
            </Link>{' '}
            · {r.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void doPdf()} loading={busy === 'pdf'}>
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
          <Button variant="outline" onClick={doPrint}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          {canEdit && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Revisar / editar
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setFinalizeOpen(true)}>
              <CheckCircle2 className="h-4 w-4" /> Aprovar e finalizar
            </Button>
          )}
          {!isDraft && (
            <>
              <Button variant="outline" onClick={() => void doNewVersion()} loading={busy === 'newv'}>
                <Copy className="h-4 w-4" /> Nova versão (copiar)
              </Button>
              {r.origin === 'local' && (
                <Button variant="outline" onClick={() => void doReconsolidate()} loading={busy === 'recon'}>
                  <RefreshCw className="h-4 w-4" /> Reconsolidar
                </Button>
              )}
            </>
          )}
          {canEdit && (
            <Button variant="ghost" onClick={() => setDiscardOpen(true)} aria-label="Descartar rascunho">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isDraft && (
        <Alert variant="warning" className="no-print mb-4">
          <strong>Rascunho pendente de revisão.</strong> {r.origin === 'ia' ? 'Este texto foi redigido com auxílio de IA a partir dos registros e pode conter imprecisões. ' : ''}Confira cada afirmação com os registros de origem, corrija o que for necessário e só então aprove. Documentos finalizados não podem ser alterados; mudanças futuras geram uma nova versão.
        </Alert>
      )}
      {r.warnings.length > 0 && (
        <Alert variant="info" className="no-print mb-4">
          <strong>{r.warnings.length} ponto(s) de atenção detectado(s)</strong> (informações ausentes, contraditórias ou a esclarecer) — listados na última seção do documento.
        </Alert>
      )}

      {editing && canEdit && (
        <Card className="no-print mb-6">
          <CardHeader>
            <CardTitle>Revisão do conteúdo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Título" htmlFor="rv-title">
              <Input id="rv-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            {sections.map((s, i) => (
              <Field key={s.id} label={s.title} htmlFor={`rv-${s.id}`}>
                <Textarea id={`rv-${s.id}`} rows={Math.min(18, Math.max(4, s.body.split('\n').length + 1))} value={s.body} onChange={(e) => setSections((x) => x.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} />
              </Field>
            ))}
            <Field label="Observações do profissional (aparecem no documento)" htmlFor="rv-notes">
              <Textarea id="rv-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTitle(r.title)
                  setSections(r.sections)
                  setNotes(r.professionalNotes)
                  setEditing(false)
                }}
              >
                Descartar alterações
              </Button>
              <Button loading={busy === 'save'} onClick={() => void run('save', async () => { await saveReportDraft(r, current); report.reload() }, 'Rascunho salvo.')}>
                Salvar rascunho
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <ReportDocument report={r} clinicName={settings.clinicName} sections={isDraft ? sections : undefined} notes={isDraft ? notes : undefined} />
        <aside className="no-print space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Versões</CardTitle>
            </CardHeader>
            {versions.loading ? (
              <Spinner />
            ) : (
              <ul className="divide-y text-sm">
                {(versions.data ?? []).map((v) => (
                  <li key={v.id}>
                    <Link to={`/relatorios/${v.id}`} className={`flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 ${v.id === r.id ? 'bg-accent/50 font-medium' : ''}`}>
                      <span>
                        v{v.version} · {formatDateTime(v.createdAt)}
                      </span>
                      <Badge variant={v.status === 'final' ? 'success' : 'warning'}>{v.status === 'final' ? 'Final' : 'Rasc.'}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Alert variant="info">O PDF baixado e a impressão reproduzem este documento. Versões finalizadas nunca são alteradas; correções geram nova versão rastreável.</Alert>
        </aside>
      </div>

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Aprovar e finalizar relatório"
        description="Após a finalização o conteúdo não poderá ser alterado. Um hash de integridade será gravado. Para mudanças futuras será criada uma nova versão."
        confirmLabel="Finalizar documento"
        loading={busy === 'final'}
        onConfirm={() =>
          reviewed
            ? run(
                'final',
                async () => {
                  await finalizeReport(user, r, current)
                  setFinalizeOpen(false)
                  setReviewed(false)
                  report.reload()
                  versions.reload()
                },
                'Relatório finalizado.',
              )
            : void toast.error('Confirme a revisão do conteúdo para continuar.')
        }
      >
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          Revisei todo o conteúdo e o confronto com os registros de origem; assumo a responsabilidade por este documento.
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Descartar rascunho"
        description="O rascunho será excluído. Os registros clínicos de origem não são afetados. Relatórios finalizados nunca podem ser excluídos."
        confirmLabel="Descartar"
        destructive
        loading={busy === 'disc'}
        onConfirm={() =>
          run('disc', async () => {
            await discardDraft(user, r)
            navigate('/relatorios')
          }, 'Rascunho descartado.')
        }
      />
    </>
  )
}
