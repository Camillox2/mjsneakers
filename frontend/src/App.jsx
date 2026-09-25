import { useState, useEffect, useRef, useCallback, createContext, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import Header from './components/Header/Header'
import Home from './pages/Home/Home'
// Admin (com gráficos), produto e rastreio carregam sob demanda: o cliente que
// abre a loja não baixa o painel inteiro.
const Admin = lazy(() => import('./pages/Admin/Admin'))
const Product = lazy(() => import('./pages/Product/Product'))
const Track = lazy(() => import('./pages/Track/Track'))
const Account = lazy(() => import('./pages/Account/Account'))
const MyData = lazy(() => import('./pages/MyData/MyData'))
const LegalPage = lazy(() => import('./pages/Legal/LegalPage'))
import CartDrawer from './components/Cart/CartDrawer'
import WishlistDrawer from './components/WishlistDrawer/WishlistDrawer'
import BackToTop from './components/BackToTop/BackToTop'
import Footer from './components/Footer/Footer'
import Maintenance from './components/Maintenance/Maintenance'
import { ToastProvider } from './components/Toast/Toast'
import ChatBot from './components/ChatBot/ChatBot'
import { reserveStock, releaseStock } from './utils/stockSession'
import { parseSizes } from './utils/sizes'
import { isSample } from './data/drops'
import { startSmoothScroll, stopSmoothScroll, scrollToY } from './lib/motion'
import { cachedGet, clearCache, TTL } from './services/cache'
import api from './services/api'
import { loadSecurityConfig } from './services/security'
import { useAccount } from './lib/AccountContext'
import { cometFlying, cometToCart } from './lib/comets'

export const CartContext = createContext()
export const AuthContext = createContext()
export const SearchContext = createContext()
export const WishlistContext = createContext()
export const DarkModeContext = createContext()

// Amostra da vitrine não existe no backend: não entra na sacola nem no pedido.
const isSampleItem = (p) => isSample(p) || String(p?.id ?? '').startsWith('amostra-')
// o admin pode gravar a chave como texto, número ou booleano
const isOn = (v) => v === true || v === 1 || v === 'true' || v === '1'
// quanto a loja espera as configurações antes de aparecer (manutenção)
const BOOT_WAIT = 1500

// id que vai para o servidor (os produtos reais têm id numérico)
const serverId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : v)
const idsFrom = (data) => {
  const list = Array.isArray(data) ? data : data?.product_ids || data?.items || []
  return list.map((x) => (x && typeof x === 'object' ? x.product_id ?? x.id : x)).filter((x) => x != null && x !== '')
}

// admin logado, só como dica de tela (a sessão é o cookie httpOnly pz_adm)
const readAdminHint = () => {
  try {
    const raw = localStorage.getItem('mj_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const readList = (key) => {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [user, setUser] = useState(readAdminHint)
  const { loggedIn: customerIn, customer } = useAccount()
  const [wishlist, setWishlist] = useState([])
  const [wishlistOpen, setWishlistOpen] = useState(false)
  // configurações que decidem se a loja abre ou mostra a manutenção
  const [store, setStore] = useState({ ready: false, maintenance: false, message: '', email: '' })
  // onde foi o último toque/clique: é de lá que sai o cometa da sacola
  const lastPointer = useRef(null)
  useEffect(() => {
    const down = (e) => {
      lastPointer.current = { x: e.clientX, y: e.clientY, at: performance.now() }
    }
    window.addEventListener('pointerdown', down, { capture: true, passive: true })
    return () => window.removeEventListener('pointerdown', down, { capture: true })
  }, [])
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('mj_dark_mode')
    return saved !== null ? saved === 'true' : true
  })

  // A loja é sempre escura (tema .pz); o modo claro/escuro vale só no admin.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('pz', !isAdminRoute)
    root.classList.toggle('dark', isAdminRoute ? darkMode : true)
    localStorage.setItem('mj_dark_mode', darkMode)
  }, [darkMode, isAdminRoute])

  const wasAdmin = useRef(isAdminRoute)
  useEffect(() => {
    if (isAdminRoute) stopSmoothScroll()
    else startSmoothScroll()
    // voltando do admin, a loja lê configurações e produtos de novo
    if (wasAdmin.current && !isAdminRoute) clearCache()
    wasAdmin.current = isAdminRoute
    if (isAdminRoute) return undefined

    // Manutenção: a loja espera as configurações um instante antes de
    // aparecer (para não piscar a vitrine e trocar pela tela de aviso). Se a
    // API não responder a tempo ou estiver fora do ar, a loja abre normal.
    let alive = true
    const apply = (data) => {
      if (!alive) return
      setStore({
        ready: true,
        maintenance: isOn(data?.maintenance_mode),
        message: data?.maintenance_message || '',
        email: data?.footer_email || data?.contact_email || '',
      })
    }
    const wait = setTimeout(() => alive && setStore((s) => (s.ready ? s : { ...s, ready: true })), BOOT_WAIT)
    cachedGet('/settings', { ttl: TTL.config, persist: true })
      .then(apply)
      .catch(() => apply(null))
    return () => {
      alive = false
      clearTimeout(wait)
    }
  }, [isAdminRoute])

  useEffect(() => {
    if (!location.hash) scrollToY(0, { immediate: true })
  }, [location.pathname])

  useEffect(() => {
    // sacola velha com amostra (de antes de a amostra sair de venda) volta sem ela
    setCart(readList('mj_cart').filter((item) => !isSampleItem(item)))
    setWishlist(readList('mj_wishlist'))
    // token antigo de antes do login por cookie: sai do aparelho
    try { localStorage.removeItem('mj_token') } catch { /* nada */ }
    // o token CSRF de reserva e a chave do captcha já ficam prontos
    loadSecurityConfig()
    // havia admin logado: o cookie ainda vale?
    if (readAdminHint()) {
      api.get('/auth/me')
        .then(({ data }) => {
          const me = data?.user || data
          if (me && typeof me === 'object') {
            setUser(me)
            try { localStorage.setItem('mj_user', JSON.stringify(me)) } catch { /* só dica */ }
          }
        })
        .catch((err) => {
          if (err?.response?.status === 401) {
            setUser(null)
            try { localStorage.removeItem('mj_user') } catch { /* nada */ }
          }
        })
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('mj_cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem('mj_wishlist', JSON.stringify(wishlist))
  }, [wishlist])

  // Favoritos com a conta: ao entrar, junta os do aparelho com os do
  // servidor (os que só existem lá são buscados para aparecer aqui) e manda
  // a união de volta. Logado, toda mudança sincroniza (com uma pausa curta).
  const wishlistRef = useRef(wishlist)
  wishlistRef.current = wishlist
  const wishSynced = useRef(false)
  useEffect(() => {
    if (!customerIn) {
      wishSynced.current = false
      return undefined
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await api.get('/account/wishlist')
        const serverIds = idsFrom(data).map(String)
        const localIds = wishlistRef.current.filter((p) => !isSampleItem(p)).map((p) => String(p.id))
        const onlyServer = serverIds.filter((id) => !localIds.includes(id)).slice(0, 40)
        const found = await Promise.allSettled(onlyServer.map((id) => cachedGet(`/products/${id}`, { ttl: TTL.item })))
        if (!alive) return
        const products = found.filter((r) => r.status === 'fulfilled' && r.value?.id).map((r) => r.value)
        if (products.length) setWishlist((prev) => [...prev, ...products.filter((p) => !prev.some((q) => String(q.id) === String(p.id)))])
        const union = [...new Set([...localIds, ...serverIds])]
        if (union.length !== serverIds.length) await api.put('/account/wishlist', union.map(serverId))
      } catch {
        /* sem rede: sincroniza na próxima mudança */
      } finally {
        if (alive) wishSynced.current = true
      }
    })()
    return () => {
      alive = false
    }
  }, [customerIn, customer?.email])

  useEffect(() => {
    if (!customerIn || !wishSynced.current) return undefined
    const ids = wishlist.filter((p) => !isSampleItem(p)).map((p) => serverId(p.id))
    const t = setTimeout(() => {
      api.put('/account/wishlist', ids).catch(() => { /* tenta de novo na próxima mudança */ })
    }, 600)
    return () => clearTimeout(t)
  }, [wishlist, customerIn])

  const addToCart = async (product, size) => {
    // amostra não está à venda; e sem tamanho não há par para reservar
    if (isSampleItem(product)) return { ok: false, reason: 'sample' }
    if (!size && parseSizes(product.sizes).length > 0) return { ok: false, reason: 'size' }
    // Reserva o estoque antes de adicionar. Em 409 (esgotou agora) cancela.
    try {
      await reserveStock({ product_id: product.id, size, quantity: 1 })
    } catch (err) {
      if (err?.response?.status === 409) {
        return { ok: false, reason: 'out_of_stock' }
      }
      // Outros erros (ex.: rota de reserva indisponível) -> segue sem bloquear a venda.
    }
    const pct = Math.min(Math.max(Number(product.discount_percentage || 0), 0), 90)
    const unit = pct > 0 ? Math.round(Number(product.price) * (1 - pct / 100) * 100) / 100 : Number(product.price)
    const entry = { ...product, list_price: product.list_price ?? Number(product.price), price: unit, discount_percentage: 0 }
    // o par vai para a sacola num cometa: do botão clicado (ou do que tem o
    // foco, no teclado) até a sacola do topo
    const recent = lastPointer.current && performance.now() - lastPointer.current.at < 4000 ? lastPointer.current : null
    const focus = document.activeElement?.getBoundingClientRect?.()
    cometToCart(recent ?? (focus?.width ? { x: focus.left + focus.width / 2, y: focus.top + focus.height / 2 } : null))
    setCart(prev => {
      const exists = prev.find(item => item.id === product.id && item.size === size)
      if (exists) {
        return prev.map(item =>
          item.id === product.id && item.size === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { ...entry, size, quantity: 1 }]
    })
    return { ok: true }
  }

  // Abre a sacola depois que o cometa chega nela e ela dá o pulo: abrir na
  // hora cobria a sacola do topo e ninguém via a chegada.
  const revealCart = useCallback(() => {
    if (!cometFlying()) {
      setCartOpen(true)
      return
    }
    let done = false
    const open = () => {
      if (done) return
      done = true
      window.removeEventListener('pz:cart-hit', onHit)
      setCartOpen(true)
    }
    const onHit = () => setTimeout(open, 420)
    window.addEventListener('pz:cart-hit', onHit)
    setTimeout(open, 2000) // o cometa sempre chega antes; é só uma garantia
  }, [])

  const removeFromCart = (productId, size) => {
    setCart(prev => prev.filter(item => !(item.id === productId && item.size === size)))
  }

  const updateQuantity = (productId, size, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId, size)
      return
    }
    setCart(prev =>
      prev.map(item =>
        item.id === productId && item.size === size
          ? { ...item, quantity }
          : item
      )
    )
  }

  const clearCart = () => { releaseStock(); setCart([]) }

  const toggleWishlist = (product) => {
    setWishlist(prev => {
      const exists = prev.find(p => p.id === product.id)
      if (exists) return prev.filter(p => p.id !== product.id)
      return [...prev, product]
    })
  }

  const removeFromWishlist = (productId) => {
    setWishlist(prev => prev.filter(p => p.id !== productId))
  }

  const cartTotal = cart.reduce((sum, item) => {
    const discount = Math.min(Math.max(Number(item.discount_percentage || 0), 0), 90)
    const price = discount > 0 ? Number(item.price) * (1 - discount / 100) : Number(item.price)
    return sum + price * item.quantity
  }, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const [searchProduct, setSearchProduct] = useState(null)

  // Admin: a sessão é o cookie httpOnly pz_adm, gravado pelo servidor no
  // login. Aqui fica só o usuário para a tela (mj_user, que não é segredo).
  const login = (userData) => {
    setUser(userData)
    try { localStorage.setItem('mj_user', JSON.stringify(userData)) } catch { /* só dica */ }
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch { /* sai da tela mesmo se a rede falhar */ }
    setUser(null)
    try { localStorage.removeItem('mj_user') } catch { /* nada */ }
  }

  const pageFallback = <div style={{ minHeight: '100svh' }} aria-busy="true" />

  let content
  if (isAdminRoute) {
    // O admin ocupa a tela inteira: nada da loja em volta dele.
    content = (
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    )
  } else if (!store.ready) {
    content = pageFallback
  } else if (store.maintenance) {
    content = <Maintenance message={store.message} email={store.email} />
  } else {
    content = (
      <>
        <Header />
        <Suspense fallback={pageFallback}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/produto/:id" element={<Product wishlist={wishlist} onToggleWishlist={toggleWishlist} />} />
            <Route path="/rastrear" element={<Track />} />
            <Route path="/conta" element={<Account />} />
            <Route path="/meus-dados" element={<MyData />} />
            <Route path="/termos" element={<LegalPage kind="terms" />} />
            <Route path="/trocas-e-devolucoes" element={<LegalPage kind="returns" />} />
            <Route path="/privacidade" element={<LegalPage kind="privacy" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <CartDrawer />
        <WishlistDrawer
          isOpen={wishlistOpen}
          onClose={() => setWishlistOpen(false)}
          items={wishlist}
          onRemove={removeFromWishlist}
          onAddToCart={async (item, size) => {
            const result = await addToCart(item, size)
            if (result?.ok) {
              setWishlistOpen(false)
              revealCart()
            }
            return result
          }}
          onProductClick={(item) => {
            // no início abre o modal; nas outras páginas vai para a página do produto
            if (location.pathname === '/') setSearchProduct(item)
            else navigate(`/produto/${item.id}`)
          }}
        />
        {location.pathname !== '/' && <Footer />}
        <BackToTop />
        <ChatBot />
      </>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
          <AuthContext.Provider value={{ user, login, logout }}>
            <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount, cartOpen, setCartOpen, revealCart }}>
              <WishlistContext.Provider value={{ wishlist, toggleWishlist, removeFromWishlist, wishlistOpen, setWishlistOpen }}>
                <SearchContext.Provider value={{ searchProduct, setSearchProduct }}>
                  {content}
                </SearchContext.Provider>
              </WishlistContext.Provider>
            </CartContext.Provider>
          </AuthContext.Provider>
        </DarkModeContext.Provider>
      </ToastProvider>
    </MotionConfig>
  )
}

export default App
