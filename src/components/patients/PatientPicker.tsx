import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useProfile } from '@/context/AuthContext'
import { searchPatients } from '@/services/patientService'
import { friendlyError } from '@/lib/errors'
import { Input } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { formatIsoDate } from '@/lib/date'
import type { Patient } from '@/types'

/** Busca e seleção de paciente (somente os autorizados ao usuário). */
export function PatientPicker({ onSelect, autoFocus }: { onSelect: (p: Patient) => void; autoFocus?: boolean }) {
  const user = useProfile()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([])
      return
    }
    const t = window.setTimeout(() => {
      setBusy(true)
      setError(null)
      searchPatients(user, term, { status: 'ativo' }, 300)
        .then((r) => setResults(r.slice(0, 8)))
        .catch((e) => setError(friendlyError(e)))
        .finally(() => setBusy(false))
    }, 300)
    return () => window.clearTimeout(t)
  }, [term, user])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input autoFocus={autoFocus} className="pl-9" placeholder="Digite o nome ou o código (PAC-…) do paciente" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Buscar paciente" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {busy && <p className="text-sm text-muted-foreground">Buscando…</p>}
      {!busy && term.trim().length >= 2 && results.length === 0 && !error && <p className="text-sm text-muted-foreground">Nenhum paciente ativo encontrado entre os que você pode acessar.</p>}
      <ul className="divide-y rounded-md border empty:hidden">
        {results.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onSelect(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent">
              <span>
                <span className="block text-sm font-medium">{p.fullName}</span>
                <span className="text-xs text-muted-foreground">Nasc. {formatIsoDate(p.birthDate)}</span>
              </span>
              <Badge variant="muted">{p.code}</Badge>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
