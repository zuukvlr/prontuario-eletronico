import { useAsync } from './useAsync'
import { DEFAULT_SETTINGS, getSettings } from '@/services/settingsService'
import type { AppSettings } from '@/types'

export function useSettings(): { settings: AppSettings; reload: () => void; loading: boolean } {
  const s = useAsync(getSettings, [])
  return { settings: s.data ?? DEFAULT_SETTINGS, reload: s.reload, loading: s.loading }
}

export function useRecentPatients() {
  const key = 'recent-patients'
  const read = (): string[] => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]
    } catch {
      return []
    }
  }
  return {
    read,
    /** Guarda apenas IDs (nunca nomes) no navegador. */
    push: (id: string) => {
      try {
        sessionStorage.setItem(key, JSON.stringify([id, ...read().filter((x) => x !== id)].slice(0, 6)))
      } catch {
        /* ignorar */
      }
    },
  }
}
