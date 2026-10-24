import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus, Users } from 'lucide-react'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { useProfile } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { listPatients, searchPatients, type PatientFilters } from '@/services/patientService'
import { listUsers } from '@/services/userService'
import { friendlyError } from '@/lib/errors'
import { calcAge, formatIsoDate } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/misc'
import type { Patient } from '@/types'

export default function PatientsPage() {
  const user = useProfile()
  const isAdmin = user.role === 'admin'
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<'ativo' | 'arquivado' | 'todos'>('ativo')
  const [responsible, setResponsible] = useState('')
  const [items, setItems] = useState<Patient[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const professionals = useAsync(() => (isAdmin ? listUsers() : Promise.resolve([])), [isAdmin])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(term.trim()), 300)
    return () => window.clearTimeout(t)
  }, [term])

  useEffect(() => {
    let cancelled = false
    const filters: PatientFilters = { status, responsibleUid: responsible || undefined }
    setLoading(true)
    setError(null)
    const run = debounced
      ? searchPatients(user, debounced, filters).then((r) => ({ items: r, cursor: null as QueryDocumentSnapshot<DocumentData> | null }))
      : listPatients(user, filters)
    run
      .then((p) => {
        if (cancelled) return
        setItems(p.items)
        setCursor(p.cursor)
      })
      .catch((e) => !cancelled && setError(friendlyError(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [user, debounced, status, responsible, tick])

  const loadMore = async () => {
    if (!cursor) return
    setMore(true)
    try {
      const p = await listPatients(user, { status, responsibleUid: responsible || undefined }, cursor)
      setItems((x) => [...x, ...p.items])
      setCursor(p.cursor)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setMore(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={isAdmin ? 'Todos os pacientes cadastrados.' : 'Pacientes aos quais você tem acesso.'}
        actions={
          isAdmin && (
            <Button asChild>
              <Link to="/pacientes/novo">
                <UserPlus className="h-4 w-4" /> Novo paciente
              </Link>
            </Button>
          )
        }
      />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input className="pl-9" placeholder="Buscar por nome ou identificador (PAC-…)" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Buscar paciente" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filtrar por status">
            <option value="ativo">Ativos</option>
            <option value="arquivado">Arquivados</option>
            <option value="todos">Todos</option>
          </Select>
          {isAdmin ? (
            <Select value={responsible} onChange={(e) => setResponsible(e.target.value)} aria-label="Filtrar por profissional responsável">
              <option value="">Todos os profissionais</option>
              {professionals.data?.filter((u) => u.active).map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.name}
                </option>
              ))}
            </Select>
          ) : (
            <span />
          )}
        </div>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={debounced ? 'Nenhum paciente encontrado' : 'Nenhum paciente por aqui'}
            description={debounced ? 'Revise o termo buscado ou os filtros.' : isAdmin ? 'Cadastre o primeiro paciente para começar.' : 'Você ainda não foi vinculado a nenhum paciente. Peça ao administrador.'}
            action={isAdmin && !debounced ? <Button asChild><Link to="/pacientes/novo">Cadastrar paciente</Link></Button> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Paciente</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Código</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Nascimento</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Responsável</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link to={`/pacientes/${p.id}`} className="font-medium text-primary hover:underline">
                          {p.fullName}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">{p.code}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {formatIsoDate(p.birthDate)} ({calcAge(p.birthDate) ?? '—'} anos)
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">{p.responsibleName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'ativo' ? 'success' : 'muted'}>{p.status === 'ativo' ? 'Ativo' : 'Arquivado'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div className="border-t p-3 text-center">
                <Button variant="outline" onClick={() => void loadMore()} loading={more}>
                  Carregar mais
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  )
}
