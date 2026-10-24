import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, ClipboardPlus, FileText, Search, UserPlus, Users, UserCheck, Stethoscope } from 'lucide-react'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useRecentPatients } from '@/hooks/useSettings'
import { countPatients, getPatient } from '@/services/patientService'
import { countRecordsSince, recentRecords } from '@/services/recordService'
import { listAudit } from '@/services/auditService'
import { formatDateTime } from '@/lib/date'
import { RECORD_TYPE_LABEL } from '@/lib/recordTypes'
import { recordCode } from '@/lib/text'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, Modal, PageHeader, Spinner } from '@/components/ui/misc'
import { PatientPicker } from '@/components/patients/PatientPicker'

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Users }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const user = useProfile()
  const navigate = useNavigate()
  const [picker, setPicker] = useState<'localizar' | 'evolucao' | null>(null)
  const recent = useRecentPatients()

  const stats = useAsync(async () => {
    const since = new Date(Date.now() - 7 * 86400000)
    const [p, r] = await Promise.all([countPatients(user), countRecordsSince(user, since)])
    return { ...p, week: r }
  }, [user.uid])
  const records = useAsync(() => recentRecords(user, 6), [user.uid])
  const activity = useAsync(() => listAudit(user, { pageSize: 8 }), [user.uid])
  const lastPatients = useAsync(async () => {
    const ids = recent.read()
    const list = await Promise.all(ids.map((id) => getPatient(id).catch(() => null)))
    return list.filter((p): p is NonNullable<typeof p> => !!p)
  }, [user.uid])

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(' ')[0]}`}
        description="Resumo do que você pode acessar no sistema."
        actions={
          <>
            {user.role === 'admin' && (
              <Button asChild>
                <Link to="/pacientes/novo">
                  <UserPlus className="h-4 w-4" /> Cadastrar paciente
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => setPicker('localizar')}>
              <Search className="h-4 w-4" /> Localizar paciente
            </Button>
            <Button variant="outline" onClick={() => setPicker('evolucao')}>
              <ClipboardPlus className="h-4 w-4" /> Nova evolução clínica
            </Button>
          </>
        }
      />

      {stats.error ? (
        <Card className="mb-6">
          <ErrorState message={stats.error} onRetry={stats.reload} />
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Pacientes cadastrados" value={stats.loading ? '…' : (stats.data?.total ?? 0)} icon={Users} />
          <Stat label="Pacientes ativos" value={stats.loading ? '…' : (stats.data?.active ?? 0)} icon={UserCheck} />
          <Stat label="Registros nos últimos 7 dias" value={stats.loading ? '…' : (stats.data?.week ?? 0)} icon={FileText} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registros clínicos recentes</CardTitle>
          </CardHeader>
          {records.loading ? (
            <Spinner />
          ) : records.error ? (
            <ErrorState message={records.error} onRetry={records.reload} />
          ) : !records.data?.length ? (
            <EmptyState title="Nenhum registro ainda" description="Os registros clínicos aparecerão aqui assim que forem criados." />
          ) : (
            <ul className="divide-y">
              {records.data.map((r) => (
                <li key={r.id}>
                  <Link to={`/registros/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/50">
                    <span>
                      <span className="block text-sm font-medium">{RECORD_TYPE_LABEL[r.type]}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(r.attendedAt)} · {r.authorName}
                      </span>
                    </span>
                    <Badge variant="muted">{recordCode(r.id)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos pacientes acessados</CardTitle>
          </CardHeader>
          {lastPatients.loading ? (
            <Spinner />
          ) : !lastPatients.data?.length ? (
            <EmptyState icon={<Stethoscope className="h-6 w-6" />} title="Nenhum acesso recente" description="Os pacientes que você abrir nesta sessão aparecerão aqui." />
          ) : (
            <ul className="divide-y">
              {lastPatients.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/pacientes/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-accent/50">
                    <span className="text-sm font-medium">{p.fullName}</span>
                    <Badge variant="muted">{p.code}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" aria-hidden /> Atividade recente {user.role !== 'admin' && <span className="text-xs font-normal text-muted-foreground">(suas ações)</span>}
            </CardTitle>
          </CardHeader>
          {activity.loading ? (
            <Spinner />
          ) : activity.error ? (
            <ErrorState message={activity.error} onRetry={activity.reload} />
          ) : !activity.data?.items.length ? (
            <EmptyState title="Sem atividade registrada" />
          ) : (
            <ul className="divide-y">
              {activity.data.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{a.actorName}</span> — {a.summary}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker === 'evolucao' ? 'Nova evolução clínica' : 'Localizar paciente'}
        description={picker === 'evolucao' ? 'Selecione o paciente para registrar a evolução.' : 'Busque pelo nome ou pelo código do paciente.'}
      >
        <PatientPicker
          autoFocus
          onSelect={(p) => {
            setPicker(null)
            navigate(picker === 'evolucao' ? `/pacientes/${p.id}/registros/novo` : `/pacientes/${p.id}`)
          }}
        />
      </Modal>
    </>
  )
}
