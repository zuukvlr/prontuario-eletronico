import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ClipboardList, FileText, History, LayoutDashboard, LogOut, Menu, Moon, ScrollText, Settings, Sun, UserPlus, Users, UserCog, X, Stethoscope } from 'lucide-react'
import { useAuth, useProfile } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { OfflineBanner } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

interface Item {
  to: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  end?: boolean
}

const ITEMS: Item[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pacientes', label: 'Pacientes', icon: Users, end: true },
  { to: '/pacientes/novo', label: 'Novo paciente', icon: UserPlus, adminOnly: true },
  { to: '/historico', label: 'Histórico clínico', icon: History },
  { to: '/relatorios', label: 'Relatórios', icon: FileText },
  { to: '/usuarios', label: 'Usuários e permissões', icon: UserCog, adminOnly: true },
  { to: '/auditoria', label: 'Auditoria', icon: ScrollText },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function AppLayout() {
  const profile = useProfile()
  const { logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const items = ITEMS.filter((i) => !i.adminOnly || profile.role === 'admin')

  const nav = (
    <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1 p-3">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground')
          }
        >
          <i.icon className="h-4 w-4 shrink-0" aria-hidden />
          {i.label}
        </NavLink>
      ))}
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={() => void logout().then(() => navigate('/login'))}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Sair
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2">
        Ir para o conteúdo
      </a>
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <Brand />
        {nav}
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <div className="text-right leading-tight">
            <p className="max-w-[10rem] truncate text-sm font-medium sm:max-w-xs">{profile.name}</p>
            <p className="text-xs text-muted-foreground">{profile.role === 'admin' ? 'Administrador' : 'Profissional'}</p>
          </div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-5 font-semibold">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <Stethoscope className="h-4 w-4" aria-hidden />
      </span>
      <span className="flex items-center gap-1">
        Prontuário <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </span>
    </div>
  )
}
