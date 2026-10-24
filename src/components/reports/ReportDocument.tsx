import { Link } from 'react-router-dom'
import { formatDateTime, formatIsoDate } from '@/lib/date'
import { recordCode } from '@/lib/text'
import { REPORT_DISCLAIMER, statusLabel } from '@/lib/reports/pdf'
import type { GeneratedReport, ReportSection } from '@/types'

/** Visualização/impressão do relatório. A classe `print-area` define o que é impresso. */
export function ReportDocument({ report, clinicName, sections, notes }: { report: GeneratedReport; clinicName: string; sections?: ReportSection[]; notes?: string }) {
  const secs = sections ?? report.sections
  const n = notes ?? report.professionalNotes
  return (
    <article className="print-area rounded-lg border bg-white p-6 text-slate-900 shadow-sm sm:p-10" aria-label="Pré-visualização do relatório">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span className="font-semibold text-blue-700">{clinicName}</span>
          <span>
            {report.number} · v{report.version}
          </span>
        </div>
        <h1 className="mt-3 text-xl font-bold uppercase text-blue-800">{report.title}</h1>
        <p className="text-xs uppercase tracking-wide text-slate-500">Relatório consolidado do paciente</p>
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[170px_1fr]">
          <dt className="font-semibold text-slate-600">Paciente</dt>
          <dd>
            {report.patientName} ({report.patientCode})
          </dd>
          <dt className="font-semibold text-slate-600">Período analisado</dt>
          <dd>{report.periodFrom || report.periodTo ? `${formatIsoDate(report.periodFrom)} a ${report.periodTo ? formatIsoDate(report.periodTo) : 'data atual'}` : 'Todo o histórico'}</dd>
          <dt className="font-semibold text-slate-600">Situação</dt>
          <dd className={report.status === 'final' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{statusLabel(report)}</dd>
          <dt className="font-semibold text-slate-600">Origem</dt>
          <dd>{report.origin === 'ia' ? `Consolidação assistida por IA${report.aiModel ? ` (${report.aiModel})` : ''} — sujeita à revisão do profissional` : 'Consolidação automática dos registros (sem IA)'}</dd>
          <dt className="font-semibold text-slate-600">Gerado em</dt>
          <dd>
            {formatDateTime(report.createdAt)} por {report.generatedByName}
            {report.generatedByRegistration ? ` — ${report.generatedByRegistration}` : ''}
          </dd>
          {report.status === 'final' && (
            <>
              <dt className="font-semibold text-slate-600">Finalizado em</dt>
              <dd>
                {formatDateTime(report.finalizedAt)} por {report.finalizedByName}
              </dd>
              <dt className="font-semibold text-slate-600">Hash (SHA-256)</dt>
              <dd className="break-all font-mono text-xs">{report.contentHash}</dd>
            </>
          )}
        </dl>
      </header>

      {secs.map((s) => (
        <section key={s.id} className="mb-6 break-inside-avoid-page">
          <h2 className="mb-2 text-base font-bold text-blue-800">{s.title}</h2>
          <p className="clinical-text text-sm">{s.body}</p>
          {s.refs.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Registros de origem:{' '}
              {s.refs.map((id, i) => (
                <span key={id}>
                  {i > 0 && ', '}
                  <Link to={`/registros/${id}`} className="text-blue-700 hover:underline print:no-underline">
                    {recordCode(id)}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </section>
      ))}

      {n.trim() && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-bold text-blue-800">Observações do profissional</h2>
          <p className="clinical-text text-sm">{n}</p>
        </section>
      )}

      <footer className="mt-10 grid gap-8 sm:grid-cols-2">
        <div className="border-t border-slate-500 pt-1 text-xs text-slate-600">
          {report.finalizedByName ?? report.generatedByName}
          {report.generatedByRegistration ? ` — ${report.generatedByRegistration}` : ''}
          <br />
          Assinatura do profissional
        </div>
        <div className="border-t border-slate-500 pt-1 text-xs text-slate-600">Data</div>
      </footer>
      <p className="mt-6 text-[11px] italic text-slate-500">{REPORT_DISCLAIMER}</p>
    </article>
  )
}
