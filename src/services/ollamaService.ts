import { AppError } from '@/lib/errors'

/** Configuração da IA local DESTA máquina (cada computador tem o seu Ollama), guardada só no navegador. */
export interface OllamaConfig {
  url: string
  model: string
}

const KEY = 'ollama-config'
export const DEFAULT_OLLAMA: OllamaConfig = { url: 'http://localhost:11434', model: 'llama3.1:8b' }

export function loadOllamaConfig(): OllamaConfig {
  try {
    return { ...DEFAULT_OLLAMA, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<OllamaConfig>) }
  } catch {
    return DEFAULT_OLLAMA
  }
}

export function saveOllamaConfig(c: OllamaConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* armazenamento indisponível */
  }
}

/** Só aceita endereços do próprio computador: dados clínicos não devem ir a servidores remotos por este caminho. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

function assertLocal(cfg: OllamaConfig) {
  if (!isLocalUrl(cfg.url)) throw new AppError('O endereço do Ollama deve ser do próprio computador (localhost ou 127.0.0.1).')
}

const base = (cfg: OllamaConfig) => cfg.url.replace(/\/$/, '')

export async function listOllamaModels(cfg: OllamaConfig): Promise<string[]> {
  assertLocal(cfg)
  try {
    const res = await fetch(`${base(cfg)}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { models?: Array<{ name: string }> }
    return (data.models ?? []).map((m) => m.name)
  } catch {
    throw new AppError('Não consegui falar com o Ollama neste computador. Ele está instalado, aberto e com o endereço do site liberado (OLLAMA_ORIGINS)? Veja o passo a passo.')
  }
}

export async function chatJson(cfg: OllamaConfig, system: string, user: string): Promise<string> {
  assertLocal(cfg)
  let res: Response
  try {
    res = await fetch(`${base(cfg)}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10 * 60_000),
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_ctx: 16384 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
  } catch {
    throw new AppError('Não consegui falar com o Ollama neste computador (ou a geração demorou demais). Verifique se ele está aberto e liberado para este site.')
  }
  if (res.status === 404) throw new AppError(`Modelo "${cfg.model}" não encontrado no Ollama. Baixe com: ollama pull ${cfg.model}`)
  if (!res.ok) throw new AppError('O Ollama retornou um erro. Tente novamente ou use a consolidação sem IA.')
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content ?? ''
}
