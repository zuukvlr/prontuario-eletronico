import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { createPatient, findDuplicates, getPatient, updatePatient } from '@/services/patientService'
import { listUsers } from '@/services/userService'
import { patientSchema, type PatientFormValues } from '@/lib/schemas'
import { friendlyError } from '@/lib/errors'
import { todayIso, formatIsoDate } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Alert, Card, CardContent, CardHeader, CardTitle, ErrorState, Modal, PageHeader, Spinner } from '@/components/ui/misc'
import type { Patient } from '@/types'

function toDefaults(p?: Patient): Partial<PatientFormValues> {
  if (!p) return { sex: 'nao_informado', firstAttendanceDate: todayIso(), extraAccessUids: [] }
  return {
    fullName: p.fullName,
    birthDate: p.birthDate,
    sex: p.sex,
    phone: p.phone,
    email: p.email,
    street: p.address?.street,
    number: p.address?.number,
    complement: p.address?.complement,
    district: p.address?.district,
    city: p.address?.city,
    state: p.address?.state,
    zip: p.address?.zip,
    guardianName: p.guardianName,
    guardianPhone: p.guardianPhone,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    firstAttendanceDate: p.firstAttendanceDate,
    responsibleUid: p.responsibleUid,
    extraAccessUids: p.accessUids.filter((u) => u !== p.responsibleUid),
    allergies: p.allergies,
    clinicalInfo: p.clinicalInfo,
    notes: p.notes,
  }
}

export default function PatientFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const user = useProfile()
  const navigate = useNavigate()
  const users = useAsync(listUsers, [])
  const existing = useAsync(() => (id ? getPatient(id) : Promise.resolve(null)), [id])
  const [dups, setDups] = useState<Patient[]>([])
  const [pending, setPending] = useState<PatientFormValues | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PatientFormValues>({ resolver: zodResolver(patientSchema), defaultValues: toDefaults() as PatientFormValues })

  useEffect(() => {
    if (existing.data) reset(toDefaults(existing.data) as PatientFormValues)
  }, [existing.data, reset])

  const professionals = (users.data ?? []).filter((u) => u.active)
  const nameOf = (uid: string) => professionals.find((u) => u.uid === uid)?.name ?? existing.data?.responsibleName ?? ''
  const extra = watch('extraAccessUids') ?? []
  const responsible = watch('responsibleUid')

  const save = async (values: PatientFormValues) => {
    setSaving(true)
    try {
      if (editing && existing.data) {
        await updatePatient(user, existing.data, values, nameOf(values.responsibleUid))
        toast.success('Cadastro atualizado.')
        navigate(`/pacientes/${existing.data.id}`)
      } else {
        const newId = await createPatient(user, values, nameOf(values.responsibleUid))
        toast.success('Paciente cadastrado com sucesso.')
        navigate(`/pacientes/${newId}`)
      }
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
      setPending(null)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!editing) {
      try {
        const found = await findDuplicates(user, values.fullName, values.birthDate)
        if (found.length) {
          setDups(found)
          setPending(values)
          return
        }
      } catch {
        /* a checagem de duplicidade não deve impedir o cadastro */
      }
    }
    await save(values)
  })

  if (editing && existing.loading) return <Spinner />
  if (editing && (existing.error || !existing.data)) return <ErrorState message={existing.error ?? 'Paciente não encontrado.'} />

  return (
    <>
      <PageHeader title={editing ? 'Editar paciente' : 'Novo paciente'} description={editing ? `Código ${existing.data?.code}` : 'O identificador interno (PAC-000000) é gerado automaticamente.'} />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" required htmlFor="fullName" error={errors.fullName?.message} className="sm:col-span-2">
              <Input id="fullName" autoComplete="off" aria-invalid={!!errors.fullName} {...register('fullName')} />
            </Field>
            <Field label="Data de nascimento" required htmlFor="birthDate" error={errors.birthDate?.message}>
              <Input id="birthDate" type="date" max={todayIso()} aria-invalid={!!errors.birthDate} {...register('birthDate')} />
            </Field>
            <Field label="Sexo" htmlFor="sex" error={errors.sex?.message} hint="Informe quando pertinente ao atendimento.">
              <Select id="sex" {...register('sex')}>
                <option value="nao_informado">Não informado</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
            <Field label="Telefone" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" type="tel" inputMode="tel" placeholder="(11) 90000-0000" {...register('phone')} />
            </Field>
            <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register('email')} />
            </Field>
            <Field label="Data do primeiro atendimento" htmlFor="firstAttendanceDate" error={errors.firstAttendanceDate?.message}>
              <Input id="firstAttendanceDate" type="date" {...register('firstAttendanceDate')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <Field label="Logradouro" htmlFor="street" className="sm:col-span-4">
              <Input id="street" {...register('street')} />
            </Field>
            <Field label="Número" htmlFor="number" className="sm:col-span-2">
              <Input id="number" {...register('number')} />
            </Field>
            <Field label="Complemento" htmlFor="complement" className="sm:col-span-2">
              <Input id="complement" {...register('complement')} />
            </Field>
            <Field label="Bairro" htmlFor="district" className="sm:col-span-2">
              <Input id="district" {...register('district')} />
            </Field>
            <Field label="CEP" htmlFor="zip" error={errors.zip?.message} className="sm:col-span-2">
              <Input id="zip" inputMode="numeric" placeholder="00000-000" {...register('zip')} />
            </Field>
            <Field label="Cidade" htmlFor="city" className="sm:col-span-4">
              <Input id="city" {...register('city')} />
            </Field>
            <Field label="UF" htmlFor="state" error={errors.state?.message} className="sm:col-span-2">
              <Input id="state" maxLength={2} className="uppercase" {...register('state')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Responsável legal e contato de emergência</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsável legal" htmlFor="guardianName" error={errors.guardianName?.message} hint="Obrigatório para menores de 18 anos.">
              <Input id="guardianName" {...register('guardianName')} />
            </Field>
            <Field label="Telefone do responsável" htmlFor="guardianPhone" error={errors.guardianPhone?.message}>
              <Input id="guardianPhone" type="tel" {...register('guardianPhone')} />
            </Field>
            <Field label="Contato de emergência" htmlFor="emergencyContactName">
              <Input id="emergencyContactName" {...register('emergencyContactName')} />
            </Field>
            <Field label="Telefone de emergência" htmlFor="emergencyContactPhone" error={errors.emergencyContactPhone?.message}>
              <Input id="emergencyContactPhone" type="tel" {...register('emergencyContactPhone')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acompanhamento e informações clínicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Profissional responsável" required htmlFor="responsibleUid" error={errors.responsibleUid?.message}>
              <Select id="responsibleUid" aria-invalid={!!errors.responsibleUid} {...register('responsibleUid')}>
                <option value="">Selecione…</option>
                {professionals.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name} {u.role === 'admin' ? '(administrador)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Outros profissionais com acesso a este paciente</legend>
              <p className="mb-2 text-xs text-muted-foreground">O responsável sempre tem acesso. Administradores acessam todos os pacientes.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {professionals
                  .filter((u) => u.role === 'professional' && u.uid !== responsible)
                  .map((u) => (
                    <label key={u.uid} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={extra.includes(u.uid)}
                        onChange={(e) => setValue('extraAccessUids', e.target.checked ? [...extra, u.uid] : extra.filter((x) => x !== u.uid), { shouldDirty: true })}
                      />
                      {u.name}
                    </label>
                  ))}
                {professionals.filter((u) => u.role === 'professional' && u.uid !== responsible).length === 0 && <p className="text-sm text-muted-foreground">Nenhum outro profissional cadastrado.</p>}
              </div>
            </fieldset>
            <Field label="Alergias conhecidas" htmlFor="allergies" error={errors.allergies?.message}>
              <Textarea id="allergies" {...register('allergies')} />
            </Field>
            <Field label="Informações clínicas relevantes" htmlFor="clinicalInfo" error={errors.clinicalInfo?.message}>
              <Textarea id="clinicalInfo" {...register('clinicalInfo')} />
            </Field>
            <Field label="Observações gerais" htmlFor="notes" error={errors.notes?.message}>
              <Textarea id="notes" {...register('notes')} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={editing ? `/pacientes/${id}` : '/pacientes'}>Cancelar</Link>
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Salvar alterações' : 'Cadastrar paciente'}
          </Button>
        </div>
      </form>

      <Modal open={pending !== null} onOpenChange={(o) => !o && setPending(null)} title="Possível cadastro duplicado" description="Encontramos paciente(s) com o mesmo nome e data de nascimento." wide>
        <ul className="mb-4 divide-y rounded-md border">
          {dups.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {d.fullName} — {formatIsoDate(d.birthDate)} ({d.code})
              </span>
              <Button asChild variant="link" size="sm">
                <Link to={`/pacientes/${d.id}`} target="_blank">
                  Abrir
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        <Alert variant="warning">Confirme que se trata de outra pessoa antes de prosseguir. Evite criar prontuários duplicados.</Alert>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)}>
            Voltar e revisar
          </Button>
          <Button loading={saving} onClick={() => pending && void save(pending)}>
            É outra pessoa, cadastrar mesmo assim
          </Button>
        </div>
      </Modal>
    </>
  )
}
