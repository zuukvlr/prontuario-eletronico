import type { ReportSection } from '@/types'
import type { BuildOutput } from '@/lib/reports/builder'
import type { VerifyResult } from '@/lib/ai/verify'

/**
 * Monta o relatório final de IA: escopo e pontos de atenção vêm do motor determinístico (nunca da IA),
 * a narrativa vem da IA, e uma seção de verificação automática mostra o que não bateu com os registros.
 */
export function composeAiReport(built: BuildOutput, verified: VerifyResult): { sections: ReportSection[]; warnings: string[] } {
  const scope = built.sections[0]
  const attention = built.sections[built.sections.length - 1]
  const verification: ReportSection = {
    id: 'verify',
    title: 'Verificação automática do texto gerado por IA',
    body: verified.issues.length
      ? `${verified.issues.map((i) => `• ${i}`).join('\n')}\n\nCada item acima exige conferência com o registro original antes da aprovação.`
      : 'Nenhuma divergência automática detectada (datas, valores, medicamentos, causalidade, diagnóstico confirmado, administração e cobertura dos registros). Isso NÃO dispensa a revisão do profissional.',
    refs: [],
  }
  const sections = [scope, ...verified.sections, verification, attention].map((s, i) => ({ ...s, id: `s${i + 1}` }))
  const warnings = [
    'Texto redigido com auxílio de IA: confira cada afirmação com os registros de origem antes de aprovar.',
    ...(verified.severe ? ['A verificação automática encontrou divergências GRAVES entre o texto da IA e os registros. Revise com atenção ou use a consolidação sem IA.'] : []),
    ...verified.issues.map((i) => `Verificação da IA: ${i}`),
    ...built.warnings,
  ]
  return { sections, warnings }
}
