import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FilePlus2, Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { addAmendment, auditRecordView, getRecord, listAmendments } from '@/services/recordService'
import { getPatient } from '@/services/patientService'
import { openAttachment } from '@/services/storageService'
import { amendmentSchema } from '@/lib/schemas'
import { FIELD_LABEL, FIELD_ORDER, RECORD_TYPE_LABEL } from '@/lib/recordTypes'
import { formatDateTime } from '@/lib/date'
import { recordCode } from '@/lib/text'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea } from '@/components/ui/form'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, Modal, Spinner } from '@/components/ui/misc'
import { ContentView } from '@/components/records/ContentView'
import type { ContentField } from '@/types'

const TEXT_FIELDS = FIELD_ORDER.filter((f) => f !== 'medications' && f !== 'returnDate')

export default function RecordDetailPage() {
  const { id = '' } = useParams()
  const user = useProfile()
  const record = useAsync(() => getRecord(id), [id])
  const patient = useAsync(async () => (record.data ? getPatient(record.data.patientId) : null), [record.data?.patientId])
  const amendments = useAsync(() => (record.data && record.data.amendmentCount > 0 ? listAmendments(id) : Promise.resolve([])), [id, record.data?.amendmentCount])
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'adendo' | 'retificacao'>('adendo')
  const [field, setField] = useState<ContentField | ''>('')
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (record.data) void auditRecordView(user, record.data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.data?.id])

  if (record.loading) return <Spinner />
  if (record.error) return <ErrorState message={record.error} onRetry={record.reload} />
  const r = record.data
  if (!r) return <EmptyState title="Registro não encontrado" description="O registro não existe ou você não tem permissão para vê-lo." />

  const submit = async () => {
    const parsed = amendmentSchema.safeParse({ kind, reason, text, field: field || undefined })
    if (!parsed.success) {
      setErrs(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrs({})
    setBusy(true)
    try {
      await addAmendment(user, r, { kind, reason, text, field: field || undefined })
      toast.success(kind === 'retificacao' ? 'Retificação registrada. O conteúdo original foi preservado.' : 'Adendo registrado.')
      setOpen(false)
      setReason('')
      setText('')
      setField('')
      record.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{RECORD_TYPE_LABEL[r.type]}</h1>
            <Badge variant={r.status === 'finalizado' ? 'success' : 'warning'}>{r.status === 'finalizado' ? 'Finalizado' : 'Rascunho'}</Badge>
            <Badge variant="muted">{recordCode(r.id)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Paciente:{' '}
            <Link to={`/pacientes/${r.patientId}`} className="text-primary hover:underline">
              {patient.data?.fullName ?? '…'}
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          {r.status === 'rascunho' && r.authorUid === user.uid && (
            <Button asChild>
              <Link to={`/registros/${r.id}/editar`}>
                <Pencil className="h-4 w-4" /> Continuar editando
              </Link>
            </Button>
          )}
          {r.status === 'finalizado' && (
            <Button variant="outline" onClick={() => setOpen(true)}>
              <FilePlus2 className="h-4 w-4" /> Adendo / retificação
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Atendimento</dt>
              <dd>{formatDateTime(r.attendedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Inserido no sistema</dt>
              <dd>{formatDateTime(r.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Profissional</dt>
              <dd>
                {r.authorName}
                {r.authorRegistration ? ` — ${r.authorRegistration}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Versão</dt>
              <dd>
                {r.version}
                {r.finalizedAt ? ` · finalizado em ${formatDateTime(r.finalizedAt)}` : ''}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Conteúdo registrado</CardTitle>
        </CardHeader>
        <CardContent>
          <ContentView content={r.content} />
        </CardContent>
      </Card>

      {r.attachments.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Anexos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {r.attachments.map((a) => (
                <li key={a.path}>
                  <button
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                    onClick={() => openAttachment(user, r.patientId, a).catch((e) => toast.error(friendlyError(e)))}
                  >
                    <Paperclip className="h-4 w-4" /> {a.name} <span className="text-xs text-muted-foreground">({(a.size / 1024).toFixed(0)} KB)</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Adendos e retificações</CardTitle>
        </CardHeader>
        {amendments.loading ? (
          <Spinner />
        ) : !amendments.data?.length ? (
          <EmptyState title="Nenhum adendo" description="O conteúdo acima é o original. Correções e complementos aparecem aqui, sem alterar o texto original." />
        ) : (
          <ul className="divide-y">
            {amendments.data.map((a) => (
              <li key={a.id} className="space-y-1 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.kind === 'retificacao' ? 'warning' : 'default'}>{a.kind === 'retificacao' ? 'Retificação' : 'Adendo'}</Badge>
                  <span className="text-muted-foreground">
                    {formatDateTime(a.createdAt)} · {a.authorName}
                  </span>
                </div>
                <p>
                  <strong>Motivo:</strong> {a.reason}
                </p>
                {a.field && (
                  <p className="text-muted-foreground">
                    Campo: {FIELD_LABEL[a.field]} — valor original (preservado): <span className="clinical-text">“{a.previousValue || 'vazio'}”</span>
                  </p>
                )}
                <p className="clinical-text">
                  <strong>{a.kind === 'retificacao' ? 'Novo valor:' : 'Texto:'}</strong> {a.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={open} onOpenChange={setOpen} title="Adendo ou retificação" description="O registro original não será alterado. Esta entrada ficará vinculada a ele com motivo, autor e horário." wide>
        <div className="space-y-4">
          <Field label="Tipo" htmlFor="am-kind">
            <Select id="am-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="adendo">Adendo (complemento de informação)</option>
              <option value="retificacao">Retificação (correção de um campo)</option>
            </Select>
          </Field>
          {kind === 'retificacao' && (
            <Field label="Campo retificado" htmlFor="am-field" error={errs.field}>
              <Select id="am-field" value={field} onChange={(e) => setField(e.target.value as ContentField)}>
                <option value="">Selecione…</option>
                {TEXT_FIELDS.filter((f) => r.content[f]).map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Motivo" required htmlFor="am-reason" error={errs.reason}>
            <Textarea id="am-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label={kind === 'retificacao' ? 'Novo valor do campo' : 'Texto do adendo'} required htmlFor="am-text" error={errs.text}>
            <Textarea id="am-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Alert variant="warning">Esta ação não pode ser desfeita nem editada depois de salva.</Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
