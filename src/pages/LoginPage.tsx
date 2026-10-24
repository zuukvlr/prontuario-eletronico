import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { loginSchema } from '@/lib/schemas'
import { friendlyError } from '@/lib/errors'
import { requestPasswordReset } from '@/services/authService'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Alert, Card, CardContent } from '@/components/ui/misc'
import { z } from 'zod'

type LoginValues = z.infer<typeof loginSchema>

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-accent/60 to-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Card>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Acesso restrito a usuários autorizados. Todas as ações são registradas.</p>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { profile, login, notice, clearNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (profile) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    clearNotice()
    try {
      await login(v.email, v.password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (e) {
      setError(friendlyError(e))
    }
  })

  return (
    <AuthShell title="Prontuário Eletrônico" subtitle="Entre com seu e-mail e senha">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {(error || notice) && <Alert variant="danger">{error ?? notice}</Alert>}
        <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Senha" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Entrar
        </Button>
        <p className="text-center text-sm">
          <Link to="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(loginSchema.pick({ email: true })) })

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  })

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link de redefinição para o seu e-mail">
      {sent ? (
        <div className="space-y-4">
          <Alert variant="info">Se o e-mail informado estiver cadastrado, você receberá em instantes um link para definir uma nova senha. Verifique também a caixa de spam.</Alert>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Voltar ao login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Enviar link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
              Voltar ao login
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}

export function ConfigMissing() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="max-w-lg">
        <CardContent className="space-y-3">
          <h1 className="text-lg font-semibold">Firebase ainda não configurado</h1>
          <p className="text-sm text-muted-foreground">
            Copie o arquivo <code>.env.example</code> para <code>.env.local</code>, preencha com as credenciais do app Web do seu projeto Firebase e reinicie o servidor. O passo a passo está em{' '}
            <code>docs/FIREBASE.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
