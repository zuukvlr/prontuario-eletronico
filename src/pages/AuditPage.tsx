import { useCallback, useEffect, useState } from 'react'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { useProfile } from '@/context/AuthContext'
import { listAudit } from '@/services/auditService'
import { friendlyError } from '@/lib/errors'
import { formatDateTime } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/misc'
import type { AuditLog } from '@/types'

export default function AuditPage() {
  const user = useProfile()
  const [items, setItems] = useState<AuditLog[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await listAudit(user)
      setItems(p.items)
      setCursor(p.cursor)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [user])
  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    setMore(true)
    try {
      const p = await listAudit(user, { cursor })
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
      <PageHeader title="Auditoria" description={user.role === 'admin' ? 'Registro imutável das operações relevantes de todos os usuários.' : 'Registro das suas próprias operações.'} />
      <Alert variant="info" className="mb-4">O log não contém conteúdo clínico: apenas quem fez o quê, quando e em qual registro. Entradas não podem ser editadas nem excluídas.</Alert>
      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="Nenhuma atividade registrada" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data/hora</th>
                    <th className="px-4 py-3 font-medium">Usuário</th>
                    <th className="px-4 py-3 font-medium">Ação</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(a.createdAt)}</td>
                      <td className="px-4 py-2.5">{a.actorName}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="muted">{a.action}</Badge>
                      </td>
                      <td className="hidden px-4 py-2.5 md:table-cell">
                        {a.summary}
                        {a.entityId ? <span className="ml-1 text-xs text-muted-foreground">({a.entityId.slice(0, 6).toUpperCase()})</span> : null}
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
