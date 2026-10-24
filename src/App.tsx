import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAdmin, RequireAuth } from '@/components/layout/guards'
import { Spinner } from '@/components/ui/misc'
import { ConfigMissing, ForgotPasswordPage, LoginPage } from '@/pages/LoginPage'
import { isFirebaseConfigured } from '@/services/firebase'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const PatientsPage = lazy(() => import('@/pages/PatientsPage'))
const PatientFormPage = lazy(() => import('@/pages/PatientFormPage'))
const PatientDetailPage = lazy(() => import('@/pages/PatientDetailPage'))
const RecordFormPage = lazy(() => import('@/pages/RecordFormPage'))
const RecordDetailPage = lazy(() => import('@/pages/RecordDetailPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const ReportViewPage = lazy(() => import('@/pages/ReportViewPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))
const AuditPage = lazy(() => import('@/pages/AuditPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

export function App() {
  if (!isFirebaseConfigured) return <ConfigMissing />
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="pacientes" element={<PatientsPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="pacientes/novo" element={<PatientFormPage />} />
              <Route path="pacientes/:id/editar" element={<PatientFormPage />} />
              <Route path="usuarios" element={<UsersPage />} />
            </Route>
            <Route path="pacientes/:id" element={<PatientDetailPage />} />
            <Route path="pacientes/:id/registros/novo" element={<RecordFormPage />} />
            <Route path="registros/:id" element={<RecordDetailPage />} />
            <Route path="registros/:id/editar" element={<RecordFormPage />} />
            <Route path="historico" element={<HistoryPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="relatorios/:id" element={<ReportViewPage />} />
            <Route path="auditoria" element={<AuditPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
