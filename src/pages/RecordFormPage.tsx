import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { getPatient } from '@/services/patientService'
import { createRecord, getRecord, newRecordId, updateDraft } from '@/services/recordService'
import { uploadAttachment, validateFile } from '@/services/storageService'
import { recordSchema, validateRecordContent, type RecordFormValues } from '@/lib/schemas'
import { FIELDS_BY_TYPE, FIELD_LABEL, MEDICATION_STATUS_LABEL, RECORD_TYPES, RECORD_TYPE_LABEL, TEXTAREA_FIELDS } from '@/lib/recordTypes'
import { fromDateTimeInput, toDateTimeInput, formatDateTime } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/misc'
import type { Attachment, ContentField, RecordType } from '@/types'

export default function RecordFormPage() {
  const { id: patientIdParam, id: recordIdParam } = useParams()
  const isEdit = window.location.pathname.startsWith('/registros/')
  const user = useProfile()
  const navigate = useNavigate()

  const existing = useAsync(() => (isEdit && recordIdParam ? getRecord(recordIdParam) : Promise.resolve(null)), [isEdit, recordIdParam])
  const patientId = isEdit ? existing.data?.patientId : patientIdParam
  const patient = useAsync(() => (patientId ? getPatient(patientId) : Promise.resolve(null)), [patientId])

  const [recordId] = useState(() => (isEdit && recordIdParam ? recordIdParam : newRecordId()))
  const [files, setFiles] = useState<File[]>([])
  const [kept, setKept] = useState<Attachment[]>([])
  const [saving, setSaving] = useState<'rascunho' | 'finalizado' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<RecordFormValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: { type: 'evolucao', attendedAt: toDateTimeInput(new Date()), content: { medications: [] } },
  })
  const meds = useFieldArray({ control, name: 'content.medications' })
  const type = watch('type') as RecordType
  const visible = useMemo(() => new Set<ContentField>(FIELDS_BY_TYPE[type]), [type])

  useEffect(() => {
    const r = existing.data
    if (r) {
      reset({ type: r.type, attendedAt: toDateTimeInput(r.attendedAt), content: { ...r.content, medications: r.content.medications ?? [] } })
      setKept(r.attachments)
    }
  }, [existing.data, reset])

  if (existing.loading || patient.loading) return <Spinner />
  if (existing.error || patient.error) return <ErrorState message={(existing.error ?? patient.error) as string} />
  if (!patient.data) return <EmptyState title="Paciente não encontrado" description="O paciente não existe ou você não tem acesso." />
  if (isEdit && existing.data && existing.data.status !== 'rascunho') {
    return <EmptyState title="Registro já finalizado" description="Registros finalizados não podem ser editados. Use adendo ou retificação na página do registro." action={<Button asChild><Link to={`/registros/${existing.data.id}`}>Abrir registro</Link></Button>} />
  }
  if (isEdit && existing.data && existing.data.authorUid !== user.uid) {
    return <EmptyState title="Sem permissão" description="Apenas o autor pode editar o rascunho." />
  }
  const p = patient.data
  if (p.status === 'arquivado') return <EmptyState title="Paciente arquivado" description="Reative o cadastro para registrar novos atendimentos." action={<Button asChild variant="outline"><Link to={`/pacientes/${p.id}`}>Voltar</Link></Button>} />

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next: File[] = []
    for (const f of Array.from(list)) {
      const err = validateFile(f)
      if (err) toast.error(err)
      else next.push(f)
    }
    setFiles((x) => [...x, ...next].slice(0, 20))
  }

  const submit = (status: 'rascunho' | 'finalizado') =>
    handleSubmit(async (values) => {
      setFormError(null)
      const content = Object.fromEntries(Object.entries(values.content).filter(([k]) => visible.has(k as ContentField))) as typeof values.content
      const attendedAt = fromDateTimeInput(values.attendedAt)
      if (Number.isNaN(attendedAt.getTime())) return setFormError('Data e hora do atendimento inválidas.')
      if (attendedAt.getTime() > Date.now() + 5 * 60_000) return setFormError('A data do atendimento não pode estar no futuro.')
      if (status === 'finalizado') {
        const msg = validateRecordContent(values.type, content, kept.length + files.length > 0)
        if (msg) return setFormError(msg)
      }
      setSaving(status)
      try {
        const uploaded: Attachment[] = []
        for (const f of files) uploaded.push(await uploadAttachment(user, p.id, recordId, f))
        const attachments = [...kept, ...uploaded]
        if (isEdit && existing.data) await updateDraft(user, existing.data, { type: values.type, attendedAt, content, attachments, status })
        else await createRecord(user, { id: recordId, patient: p, type: values.type, attendedAt, content, attachments, status })
        toast.success(status === 'finalizado' ? 'Registro finalizado e salvo no histórico.' : 'Rascunho salvo.')
        navigate(status === 'finalizado' ? `/registros/${recordId}` : `/pacientes/${p.id}`)
      } catch (e) {
        setFormError(friendlyError(e))
      } finally {
        setSaving(null)
      }
    })

  const field = (f: ContentField) => {
    if (!visible.has(f) || f === 'medications' || f === 'returnDate') return null
    const err = (errors.content as Record<string, { message?: string }> | undefined)?.[f]?.message
    return (
      <Field key={f} label={FIELD_LABEL[f]} htmlFor={`c-${f}`} error={err} className={f === 'title' ? '' : 'sm:col-span-2'}>
        {TEXTAREA_FIELDS.includes(f) ? <Textarea id={`c-${f}`} rows={3} {...register(`content.${f}` as `content.${'title'}`)} /> : <Input id={`c-${f}`} {...register(`content.${f}` as `content.${'title'}`)} />}
      </Field>
    )
  }

  return (
    <>
      <PageHeader title={isEdit ? 'Editar rascunho' : 'Novo registro clínico'} description={`Paciente: ${p.fullName} (${p.code})`} />
      {p.allergies?.trim() && <Alert variant="danger" className="mb-4"><strong>Alergias conhecidas:</strong> {p.allergies}</Alert>}
      <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <Card>
          <CardHeader>
            <CardTitle>Atendimento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de registro" required htmlFor="type">
              <Select id="type" {...register('type')}>
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RECORD_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Data e hora do atendimento" required htmlFor="attendedAt" error={errors.attendedAt?.message} hint="Horário de Brasília. É a data em que o atendimento ocorreu.">
              <Input id="attendedAt" type="datetime-local" {...register('attendedAt')} />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              A data/hora de <strong>inserção no sistema</strong> é registrada automaticamente pelo servidor e não pode ser alterada. Profissional: {user.name}
              {user.registration ? ` — ${user.registration}` : ''}. Você pode registrar vários atendimentos no mesmo dia.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{RECORD_TYPE_LABEL[type]}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(['title', 'chiefComplaint', 'reportedSymptoms', 'observedFindings', 'evolution', 'assessment', 'diagnosticHypotheses', 'confirmedDiagnosis'] as ContentField[]).map(field)}
            {visible.has('medications') && (
              <div className="space-y-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Medicamentos</h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => meds.append({ name: '', dose: '', route: '', frequency: '', status: 'prescrito' })}>
                    <Plus className="h-4 w-4" /> Adicionar medicamento
                  </Button>
                </div>
                {meds.fields.length === 0 && <p className="text-sm text-muted-foreground">Nenhum medicamento adicionado.</p>}
                {meds.fields.map((m, i) => (
                  <div key={m.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                    <Field label="Medicamento" className="sm:col-span-2" htmlFor={`m-${i}-n`} error={errors.content?.medications?.[i]?.name?.message}>
                      <Input id={`m-${i}-n`} {...register(`content.medications.${i}.name`)} />
                    </Field>
                    <Field label="Dosagem" htmlFor={`m-${i}-d`}>
                      <Input id={`m-${i}-d`} placeholder="500 mg" {...register(`content.medications.${i}.dose`)} />
                    </Field>
                    <Field label="Via" htmlFor={`m-${i}-r`}>
                      <Input id={`m-${i}-r`} placeholder="VO" {...register(`content.medications.${i}.route`)} />
                    </Field>
                    <Field label="Frequência" htmlFor={`m-${i}-f`}>
                      <Input id={`m-${i}-f`} placeholder="8/8h" {...register(`content.medications.${i}.frequency`)} />
                    </Field>
                    <Field label="Situação" htmlFor={`m-${i}-s`}>
                      <div className="flex gap-1">
                        <Select id={`m-${i}-s`} {...register(`content.medications.${i}.status`)}>
                          {Object.entries(MEDICATION_STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                        <Button type="button" variant="ghost" size="icon" onClick={() => meds.remove(i)} aria-label="Remover medicamento">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Field>
                  </div>
                ))}
              </div>
            )}
            {(['procedures', 'requestedExams', 'examResults', 'conduct', 'guidance', 'followUpPlan'] as ContentField[]).map(field)}
            {visible.has('returnDate') && (
              <Controller
                control={control}
                name="content.returnDate"
                render={({ field: f }) => (
                  <Field label={FIELD_LABEL.returnDate} htmlFor="c-return" error={errors.content?.returnDate?.message}>
                    <Input id="c-return" type="date" value={f.value ?? ''} onChange={f.onChange} />
                  </Field>
                )}
              />
            )}
            {field('additionalNotes')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anexos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">PDF, imagens, DOCX, XLSX ou TXT. Até 10 MB por arquivo e 20 por registro. Os arquivos não poderão ser removidos depois do envio.</p>
            <Input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.txt" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} aria-label="Selecionar anexos" />
            <ul className="space-y-1 text-sm">
              {kept.map((a) => (
                <li key={a.path} className="flex items-center gap-2"><Paperclip className="h-3.5 w-3.5" /> {a.name} <span className="text-xs text-muted-foreground">(já enviado)</span></li>
              ))}
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5" /> {f.name} <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remover ${f.name}`} className="text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {formError && <Alert variant="danger">{formError}</Alert>}
        {isEdit && existing.data && <p className="text-xs text-muted-foreground">Rascunho criado em {formatDateTime(existing.data.createdAt)}.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={`/pacientes/${p.id}`}>Cancelar</Link>
          </Button>
          <Button type="button" variant="secondary" loading={saving === 'rascunho'} disabled={saving !== null} onClick={() => void submit('rascunho')()}>
            Salvar rascunho
          </Button>
          <Button type="button" loading={saving === 'finalizado'} disabled={saving !== null} onClick={() => void submit('finalizado')()}>
            Finalizar registro
          </Button>
        </div>
        <p className="text-right text-xs text-muted-foreground">Após finalizado, o registro fica imutável: correções são feitas por adendo ou retificação, com motivo, autor e horário.</p>
      </form>
    </>
  )
}
