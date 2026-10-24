import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { friendlyError } from '@/lib/errors'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
  setData: (v: T | undefined) => void
}

/** Carrega dados assíncronos com estados de carregamento/erro e proteção contra respostas fora de ordem. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((d) => {
        if (id === seq.current) setData(d)
      })
      .catch((e) => {
        if (id === seq.current) setError(friendlyError(e))
      })
      .finally(() => {
        if (id === seq.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload, setData }
}
