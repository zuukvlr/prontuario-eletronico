import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { createUser, listUsers, updateUser } from '@/services/userService'
import { userSchema } from '@/lib/schemas'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Alert, Badge, Card, ErrorState, Modal, PageHeader, Spinner } from '@/components/ui/misc'

type FormValues = z.infer<typeof userSchema>

export default function UsersPage() {
  const me = useProfile()
  const users = useAsync(listUsers, [])
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(userSchema), defaultValues: { role: 'professional' } })

  const onSubmit = handleSubmit(async (v) => {
    try {
      await createUser(me, v)
      toast.success('Usuário autorizado. Um e-mail foi enviado para que ele defina a própria senha.')
      reset({ role: 'professional' })
      setOpen(false)
      users.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  })

  const toggle = async (uid: string, active: boolean) => {
    try {
      await updateUser(me, uid, { active })
      toast.success(active ? 'Usuário reativado.' : 'Usuário desativado.')
      users.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Somente usuários cadastrados aqui conseguem acessar o sistema. Não existe cadastro público."
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> Autorizar novo usuário
          </Button>
        }
      />
      <Card>
        {users.loading ? (
          <Spinner />
        ) : users.error ? (
          <ErrorState message={users.error} onRetry={users.reload} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">E-mail</th>
                  <th className="px-4 py-3 font-medium">Perfil</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.data?.map((u) => (
                  <tr key={u.uid}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{u.name}</span>
                      {u.registration && <span className="block text-xs text-muted-foreground">{u.registration}</span>}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3">{u.role === 'admin' ? 'Administrador' : 'Profissional'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.active ? 'success' : 'muted'}>{u.active ? 'Ativo' : 'Desativado'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.uid !== me.uid && (
                        <Button size="sm" variant="outline" onClick={() => void toggle(u.uid, !u.active)}>
                          {u.active ? 'Desativar' : 'Reativar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onOpenChange={setOpen} title="Autorizar novo usuário" description="A conta é criada e o usuário recebe um e-mail para definir a senha." wide>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" required htmlFor="u-name" error={errors.name?.message} className="sm:col-span-2">
              <Input id="u-name" {...register('name')} />
            </Field>
            <Field label="E-mail" required htmlFor="u-email" error={errors.email?.message}>
              <Input id="u-email" type="email" {...register('email')} />
            </Field>
            <Field label="Perfil" htmlFor="u-role" error={errors.role?.message}>
              <Select id="u-role" {...register('role')}>
                <option value="professional">Profissional autorizado</option>
                <option value="admin">Administrador</option>
              </Select>
            </Field>
            <Field label="Registro profissional" htmlFor="u-reg" hint="Ex.: CRM-SP 123456">
              <Input id="u-reg" {...register('registration')} />
            </Field>
            <Field label="Especialidade" htmlFor="u-spec">
              <Input id="u-spec" {...register('specialty')} />
            </Field>
          </div>
          <Alert variant="warning">Administradores têm acesso a todos os pacientes e à auditoria. Conceda esse perfil com critério.</Alert>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Autorizar usuário
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
