import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { motion, MotionConfig } from 'framer-motion'
import { FiGrid, FiLogOut, FiMoon, FiSun, FiExternalLink, FiBell, FiBellOff } from 'react-icons/fi'
import { AuthContext, DarkModeContext } from '../../App'
import { BRAND } from '../../config/brand'
import api, { asList, setSessionEndHandler } from './lib/api'
import { AdminContext } from './lib/context'
import { ChatProvider, useChat } from './lib/chat'
import { notify, notifyPermission, askNotifyPermission, soundOn, setSound, NAVIGATE_EVENT } from './lib/notify'
import { NAV, ALL_ITEMS, BOTTOM, titleFor } from './nav'
import { LayerProvider, ConfirmProvider, ToastProvider, Dialog, Button, Skeleton, Switch } from './ui'
import Login from './Login'
import t from './theme.module.css'

// Cada seção é baixada só quando aberta: o celular não carrega o painel inteiro.
const Dashboard = lazy(() => import('./sections/Dashboard'))
const Orders = lazy(() => import('./sections/Orders'))
const Customers = lazy(() => import('./sections/Customers'))
const Coupons = lazy(() => import('./sections/Coupons'))
const Loyalty = lazy(() => import('./sections/Loyalty'))
const Products = lazy(() => import('./sections/Products'))
const Stock = lazy(() => import('./sections/Stock'))
const Catalog = lazy(() => import('./sections/Catalog'))
const Reviews = lazy(() => import('./sections/Reviews'))
const Banners = lazy(() => import('./sections/Banners'))
const Storefront = lazy(() => import('./sections/Storefront'))
const Newsletter = lazy(() => import('./sections/Newsletter'))
const Shipping = lazy(() => import('./sections/Shipping'))
const Reports = lazy(() => import('./sections/Reports'))
const Team = lazy(() => import('./sections/Team'))
const Settings = lazy(() => import('./sections/Settings'))
const Activity = lazy(() => import('./sections/Activity'))
const Conversations = lazy(() => import('./sections/Conversations'))
const NotFound = lazy(() => import('./sections/NotFound'))

const cx = (...c) => c.filter(Boolean).join(' ')

export default function Admin() {
  const { user, login, logout } = useContext(AuthContext)
  const { darkMode, setDarkMode } = useContext(DarkModeContext)
  const [layer, setLayer] = useState(null)
  const [notice, setNotice] = useState('')
  const dark = darkMode !== false

  // classes no <html>: o fundo do body acompanha o tema do painel
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('pz-admin')
    root.classList.toggle('pz-admin-light', !!user && !dark)
    return () => root.classList.remove('pz-admin', 'pz-admin-light')
  }, [dark, user])

  const endSession = useCallback(() => {
    logout()
    setNotice('Sua sessão terminou. Entre de novo para continuar.')
  }, [logout])

  useEffect(() => {
    setSessionEndHandler(endSession)
    return () => setSessionEndHandler(null)
  }, [endSession])

  // Confere o token guardado assim que o painel abre (conta desativada cai aqui).
  useEffect(() => {
    if (user) api.get('/auth/verify').catch(() => {})
  }, [user])

  const handleLogin = (u, token) => {
    setNotice('')
    login(u, token)
  }

  return (
    <div className={cx(t.root, user && !dark && t.light)}>
      <MotionConfig reducedMotion="user">
        <LayerProvider node={layer}>
          <ToastProvider>
            <ConfirmProvider>
              {user ? <ChatProvider><Shell user={user} dark={dark} setDark={setDarkMode} onLogout={logout} /></ChatProvider> : <Login onLogin={handleLogin} notice={notice} />}
            </ConfirmProvider>
          </ToastProvider>
        </LayerProvider>
      </MotionConfig>
      <div ref={setLayer} />
    </div>
  )
}

function Shell({ user, dark, setDark, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const chat = useChat()
  const [base, setBase] = useState({ pendingOrders: 0, pendingReviews: 0 })
  const [moreOpen, setMoreOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const lastPending = useRef(null)

  const refreshCounts = useCallback(async () => {
    const [orders, reviews] = await Promise.allSettled([
      api.get('/orders/status-counts'),
      api.get('/reviews', { params: { status: 'pending' } }),
    ])
    const pendingOrders = orders.status === 'fulfilled' ? Number(orders.value.data?.pending || 0) : null
    // pedido novo desde a última olhada: avisa (fora da aba, com som)
    if (pendingOrders != null && lastPending.current != null && pendingOrders > lastPending.current) {
      const n = pendingOrders - lastPending.current
      notify(n === 1 ? 'Pedido novo na loja' : `${n} pedidos novos na loja`, 'Toque para ver e confirmar.', '/admin/pedidos?status=pending', 'pedido-novo')
    }
    if (pendingOrders != null) lastPending.current = pendingOrders
    setBase(b => ({
      pendingOrders: pendingOrders ?? b.pendingOrders,
      pendingReviews: reviews.status === 'fulfilled' ? asList(reviews.value.data).length : b.pendingReviews,
    }))
  }, [])

  useEffect(() => {
    refreshCounts()
    const id = setInterval(refreshCounts, 30000)
    return () => clearInterval(id)
  }, [refreshCounts])

  // tocar na notificação traz para a tela certa
  useEffect(() => {
    const go = (e) => { if (typeof e.detail === 'string' && e.detail.startsWith('/admin')) navigate(e.detail) }
    window.addEventListener(NAVIGATE_EVENT, go)
    return () => window.removeEventListener(NAVIGATE_EVENT, go)
  }, [navigate])

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const counts = useMemo(() => ({ ...base, unreadChats: chat?.totalUnread || 0 }), [base, chat?.totalUnread])
  const title = titleFor(location.pathname)
  const waiting = counts.pendingOrders + counts.unreadChats
  useEffect(() => { document.title = `${waiting > 0 ? `(${waiting}) ` : ''}${title} | Painel ${BRAND.short}` }, [title, waiting])

  const ctx = useMemo(() => ({ user, dark, counts, refreshCounts }), [user, dark, counts, refreshCounts])
  const initials = (user?.username || '?').slice(0, 2).toUpperCase()
  const roleLabel = user?.role === 'super_admin' ? 'Dono' : user?.role === 'admin' ? 'Administrador' : 'Equipe'

  const logout = () => { onLogout(); navigate('/admin') }
  const toggleTheme = () => setDark(!dark)

  // Do "Mais": fecha a folha primeiro (tira a entrada dela do histórico) e só
  // depois navega. Assim o voltar do Android não passa por uma entrada fantasma.
  const goFromMore = (to) => (e) => {
    e.preventDefault()
    let done = false
    const go = () => { if (done) return; done = true; window.removeEventListener('popstate', go); navigate(to) }
    window.addEventListener('popstate', go)
    setMoreOpen(false)
    setTimeout(go, 350)
  }

  return (
    <AdminContext.Provider value={ctx}>
      <aside className={t.sidebar} aria-label="Menu do painel">
        <NavLink to="/admin" className={t.brand} aria-label="Início do painel">
          <img src={BRAND.logoSmall} alt={BRAND.name} className={t.brandLogo} />
          <span className={t.brandTag}>painel</span>
        </NavLink>
        <nav className={t.nav}>
          {NAV.map((group, gi) => (
            <div key={gi} className={t.navGroup}>
              {group.label && <span className={t.navGroupLabel}>{group.label}</span>}
              {group.items.map(it => (
                <NavItem key={it.to} item={it} count={it.badge ? counts[it.badge] : 0} />
              ))}
            </div>
          ))}
        </nav>
        <div className={t.sideFoot}>
          <div className={t.who}>
            <span className={t.avatar} aria-hidden="true">{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className={t.whoName}>{user?.username}</div>
              <div className={t.whoRole}>{roleLabel}</div>
            </div>
          </div>
          <button type="button" className={t.iconBtn} onClick={() => setAlertsOpen(true)} aria-label="Avisos de pedido e de chat" title="Avisos">
            {notifyPermission() === 'granted' ? <FiBell /> : <FiBellOff />}
          </button>
          <button type="button" className={t.iconBtn} onClick={toggleTheme} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'} title={dark ? 'Tema claro' : 'Tema escuro'}>
            {dark ? <FiSun /> : <FiMoon />}
          </button>
          <button type="button" className={t.iconBtn} onClick={logout} aria-label="Sair" title="Sair">
            <FiLogOut />
          </button>
        </div>
      </aside>

      <div className={t.main}>
        <header className={t.topbar}>
          <img src={BRAND.logoSmall} alt="" className={t.topMobileBrand} aria-hidden="true" />
          <p className={t.topTitle} aria-live="polite">{title}</p>
          <a className={t.iconBtn} href="/" target="_blank" rel="noopener noreferrer" aria-label="Abrir a loja em outra aba" title="Ver a loja">
            <FiExternalLink />
          </a>
        </header>

        <main className={t.content} id="conteudo">
          <Suspense fallback={<div className={t.fallback}><div style={{ width: 'min(420px, 90%)' }}><Skeleton lines={4} widths={['60%', '100%', '90%', '75%']} /></div></div>}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="pedidos/*" element={<Orders />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="cupons" element={<Coupons />} />
              <Route path="fidelidade" element={<Loyalty />} />
              <Route path="produtos/*" element={<Products />} />
              <Route path="estoque/*" element={<Stock />} />
              <Route path="marcas" element={<Catalog />} />
              <Route path="avaliacoes" element={<Reviews />} />
              <Route path="banners" element={<Banners />} />
              <Route path="vitrine" element={<Storefront />} />
              <Route path="newsletter" element={<Newsletter />} />
              <Route path="frete/*" element={<Shipping />} />
              <Route path="relatorios" element={<Reports />} />
              <Route path="equipe" element={<Team />} />
              <Route path="configuracoes" element={<Settings />} />
              <Route path="atividade" element={<Activity />} />
              <Route path="conversas/*" element={<Conversations />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav className={t.bottomNav} aria-label="Atalhos">
        {BOTTOM.map(to => {
          const it = ALL_ITEMS.find(x => x.to === to)
          return <BottomTab key={to} item={it} count={it.badge ? counts[it.badge] : 0} />
        })}
        <button type="button" className={cx(t.tab, moreOpen && t.tabActive)} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <FiGrid aria-hidden="true" />
          Mais
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Todas as seções" size="l">
        {NAV.map((group, gi) => (
          <div key={gi} className={t.moreGroup}>
            {group.label && <p className={t.moreGroupLabel}>{group.label}</p>}
            <div className={t.moreSheet}>
              {group.items.map(it => {
                const Icon = it.icon
                const n = it.badge ? counts[it.badge] : 0
                return (
                  <NavLink key={it.to} to={it.to} end={it.end} onClick={goFromMore(it.to)} className={({ isActive }) => cx(t.moreItem, isActive && t.moreItemActive)}>
                    <Icon aria-hidden="true" />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {n > 0 && <span className={t.navBadge}>{n}</span>}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
        <div className={t.moreFoot}>
          <Button icon={<FiBell />} onClick={() => setAlertsOpen(true)}>Avisos</Button>
          <Button icon={dark ? <FiSun /> : <FiMoon />} onClick={toggleTheme}>{dark ? 'Tema claro' : 'Tema escuro'}</Button>
          <Button icon={<FiLogOut />} onClick={logout}>Sair ({user?.username})</Button>
        </div>
      </Dialog>
      <AlertsDialog open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </AdminContext.Provider>
  )
}

// Liga as notificações do navegador e o som dos avisos.
function AlertsDialog({ open, onClose }) {
  const [perm, setPerm] = useState(notifyPermission())
  const [sound, setSoundState] = useState(soundOn())
  useEffect(() => { if (open) { setPerm(notifyPermission()); setSoundState(soundOn()) } }, [open])
  const turnOn = async () => setPerm(await askNotifyPermission())
  return (
    <Dialog open={open} onClose={onClose} size="s" title="Avisos" description="Com o painel aberto em outra aba ou minimizado, você fica sabendo de pedido novo e de mensagem no chat.">
      <div style={{ display: 'grid', gap: 12 }}>
        {perm === 'unsupported' ? (
          <p style={{ margin: 0 }}>Este navegador não mostra notificações. O som e o número no título da aba continuam valendo.</p>
        ) : perm === 'granted' ? (
          <p style={{ margin: 0 }}>Notificações ligadas neste aparelho.</p>
        ) : perm === 'denied' ? (
          <p style={{ margin: 0 }}>As notificações estão bloqueadas para este site. Libere no cadeado ao lado do endereço, em Notificações, e recarregue.</p>
        ) : (
          <Button variant="primary" icon={<FiBell />} onClick={turnOn}>Ligar notificações</Button>
        )}
        <Switch checked={sound} onChange={v => { setSound(v); setSoundState(v) }} label="Tocar um som" description="Um toque curto quando chega pedido ou mensagem." />
      </div>
    </Dialog>
  )
}

function NavItem({ item, count }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(t.navItem, isActive && t.navItemActive)}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-trail" className={t.navTrail} transition={{ type: 'spring', stiffness: 420, damping: 38 }} />}
          <span className={t.navIcon}><Icon aria-hidden="true" /></span>
          <span className={t.navLabel}>{item.label}</span>
          {count > 0 && <span className={t.navBadge} aria-label={`${count} pendentes`}>{count}</span>}
        </>
      )}
    </NavLink>
  )
}

function BottomTab({ item, count }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(t.tab, isActive && t.tabActive)}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tab-glow" className={t.tabGlow} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
          <Icon aria-hidden="true" />
          {item.label}
          {count > 0 && <span className={t.tabDot} aria-label={`${count} pendentes`}>{count > 99 ? '99+' : count}</span>}
        </>
      )}
    </NavLink>
  )
}
