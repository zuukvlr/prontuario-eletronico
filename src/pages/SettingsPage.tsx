import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useAsync } from '@/hooks/useAsync'
import { getSettings, saveSettings } from '@/services/settingsService'
import { requestPasswordReset } from '@/services/authService'
import { exportPatientData } from '@/services/exportService'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, ErrorState, PageHeader, Spinner } from '@/components/ui/misc'
import { PatientPicker } from '@/components/patients/PatientPicker'
import { isLocalUrl, listOllamaModels, loadOllamaConfig, saveOllamaConfig } from '@/services/ollamaService'
import type { AppSettings, Patient } from '@/types'

export default function SettingsPage() {
  const user = useProfile()
  const { theme, toggle } = useTheme()
  const isAdmin = user.role === 'admin'
  const settings = useAsync(getSettings, [])
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [exportPatient, setExportPatient] = useState<Patient | null>(null)
  const [exporting, setExporting] = useState(false)
  const [ollama, setOllama] = useState(loadOllamaConfig)
  const [ollamaMsg, setOllamaMsg] = useState<string | null>(null)

  useEffect(() => {
    if (settings.data) setForm(settings.data)
  }, [settings.data])

  if (settings.loading) return <Spinner />
  if (settings.error && isAdmin) return <ErrorState message={settings.error} onRetry={settings.reload} />

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      await saveSettings(user, form)
      toast.success('Configurações salvas.')
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Minha conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <strong>{user.name}</strong> · {user.email} <Badge variant="muted">{isAdmin ? 'Administrador' : 'Profissional'}</Badge>
            </p>
            <p className="text-muted-foreground">Registro profissional: {user.registration || 'não informado (peça ao administrador para preencher; ele aparece nos documentos)'}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={toggle}>
                Tema: {theme === 'dark' ? 'escuro' : 'claro'} (alternar)
              </Button>
              <Button variant="outline" onClick={() => requestPasswordReset(user.email).then(() => toast.success('Enviamos um e-mail para redefinir sua senha.')).catch((e) => toast.error(friendlyError(e)))}>
                Redefinir minha senha por e-mail
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>IA local neste computador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cada computador usa o próprio Ollama. Esta configuração fica só neste navegador. Instalação: ollama.com/download; depois, no terminal: <code>ollama pull {ollama.model}</code>. Para o site conversar com o Ollama, defina a variável de ambiente <code>OLLAMA_ORIGINS</code> com o endereço do sistema (ex.: <code>{window.location.origin}</code>) e reinicie o Ollama.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Endereço do Ollama" htmlFor="o-url" hint="Somente localhost ou 127.0.0.1.">
                <Input id="o-url" value={ollama.url} onChange={(e) => setOllama({ ...ollama, url: e.target.value })} />
              </Field>
              <Field label="Modelo" htmlFor="o-model" hint="Ex.: llama3.1:8b, qwen2.5:7b.">
                <Input id="o-model" value={ollama.model} onChange={(e) => setOllama({ ...ollama, model: e.target.value })} />
              </Field>
            </div>
            {ollamaMsg && <Alert variant="info">{ollamaMsg}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!isLocalUrl(ollama.url)) return setOllamaMsg('O endereço deve ser localhost ou 127.0.0.1.')
                  saveOllamaConfig(ollama)
                  listOllamaModels(ollama)
                    .then((m) => setOllamaMsg(m.includes(ollama.model) ? `Conectado. Modelo "${ollama.model}" disponível.` : `Conectado, mas o modelo "${ollama.model}" não foi baixado. Modelos instalados: ${m.join(', ') || 'nenhum'}.`))
                    .catch((e) => setOllamaMsg(friendlyError(e)))
                }}
              >
                Salvar e testar conexão
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAdmin && form && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Instituição e documentos</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome da clínica / instituição" htmlFor="s-name" className="sm:col-span-2" hint="Aparece no cabeçalho dos relatórios em PDF.">
                  <Input id="s-name" value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />
                </Field>
                <Field label="CNPJ / documento" htmlFor="s-doc">
                  <Input id="s-doc" value={form.clinicDocument ?? ''} onChange={(e) => setForm({ ...form, clinicDocument: e.target.value })} />
                </Field>
                <Field label="Prazo de retenção dos prontuários (anos)" htmlFor="s-ret" hint="Referência para a política de descarte (ver docs/LGPD.md). Nada é apagado automaticamente.">
                  <Input id="s-ret" type="number" min={1} max={99} value={form.retentionYears} onChange={(e) => setForm({ ...form, retentionYears: Number(e.target.value) || 20 })} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inteligência artificial (política da instituição)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert variant="warning">
                  A chave da API <strong>nunca</strong> é informada aqui. Ela é guardada no Secret Manager do Firebase (<code>firebase functions:secrets:set ANTHROPIC_API_KEY</code>). Antes de habilitar, avalie base legal, consentimento, contrato com o provedor e minimização de dados (docs/IA.md e docs/LGPD.md).
                </Alert>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={form.aiLocalEnabled} onChange={(e) => setForm({ ...form, aiLocalEnabled: e.target.checked })} />
                  Permitir IA local (Ollama nos computadores da clínica — os dados não saem da máquina)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={form.aiEnabled} onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })} />
                  Permitir IA em nuvem (Cloud Function e provedor externo)
                </label>
                <Field label="Modelo" htmlFor="s-model" hint="Identificador do modelo usado pela Cloud Function.">
                  <Input id="s-model" value={form.aiModel} onChange={(e) => setForm({ ...form, aiModel: e.target.value })} />
                </Field>
              </CardContent>
            </Card>
            <div>
              <Button onClick={() => void save()} loading={saving}>
                Salvar configurações
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Exportação de dados do titular (LGPD)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Gera um arquivo JSON com cadastro, registros, adendos e relatórios do paciente. A exportação é registrada na auditoria.</p>
                {exportPatient ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{exportPatient.fullName} ({exportPatient.code})</Badge>
                    <Button
                      loading={exporting}
                      onClick={async () => {
                        setExporting(true)
                        try {
                          await exportPatientData(user, exportPatient.id)
                          toast.success('Exportação concluída.')
                        } catch (e) {
                          toast.error(friendlyError(e))
                        } finally {
                          setExporting(false)
                        }
                      }}
                    >
                      <Download className="h-4 w-4" /> Exportar JSON
                    </Button>
                    <Button variant="ghost" onClick={() => setExportPatient(null)}>
                      Trocar
                    </Button>
                  </div>
                ) : (
                  <PatientPicker onSelect={setExportPatient} />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
