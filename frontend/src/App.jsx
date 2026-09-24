import { useState, useEffect, useRef, createContext, lazy, Suspense } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import Header from './components/Header/Header'
import Home from './pages/Home/Home'
// Admin (com gráficos), produto e rastreio carregam sob demanda: o cliente que
// abre a loja não baixa o painel inteiro.
const Admin = lazy(() => import('./pages/Admin/Admin'))
const Product = lazy(() => import('./pages/Product/Product'))
const Track = lazy(() => import('./pages/Track/Track'))
import CartDrawer from './components/Cart/CartDrawer'
import WishlistDrawer from './components/WishlistDrawer/WishlistDrawer'
import BackToTop from './components/BackToTop/BackToTop'
import Footer from './components/Footer/Footer'
import { ToastProvider } from './components/Toast/Toast'
import ChatBot from './components/ChatBot/ChatBot'
import { reserveStock, releaseStock } from './utils/stockSession'
import { parseSizes } from './utils/sizes'
import { startSmoothScroll, stopSmoothScroll, scrollToY } from './lib/motion'
import { clearCache } from './services/cache'
import { cometToCart } from './lib/comets'

export const CartContext = createContext()
export const AuthContext = createContext()
export const SearchContext = createContext()
export const WishlistContext = createContext()
export const DarkModeContext = createContext()

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [wishlist, setWishlist] = useState([])
  const [wishlistOpen, setWishlistOpen] = useState(false)
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
  }, [isAdminRoute])

  useEffect(() => {
    if (!location.hash) scrollToY(0, { immediate: true })
  }, [location.pathname])

  useEffect(() => {
    const savedCart = localStorage.getItem('mj_cart')
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)) } catch {}
    }
    const savedWishlist = localStorage.getItem('mj_wishlist')
    if (savedWishlist) {
      try { setWishlist(JSON.parse(savedWishlist)) } catch {}
    }
    const token = localStorage.getItem('mj_token')
    const savedUser = localStorage.getItem('mj_user')
    if (token && savedUser) {
      try { setUser(JSON.parse(savedUser)) } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('mj_cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem('mj_wishlist', JSON.stringify(wishlist))
  }, [wishlist])

  const addToCart = async (product, size) => {
    // Reserva o estoque antes de adicionar. Em 409 (esgotou agora) cancela.
    // Exemplar de amostra não existe no backend: não há estoque para reservar.
    if (!product.sample) {
      try {
        await reserveStock({ product_id: product.id, size, quantity: 1 })
      } catch (err) {
        if (err?.response?.status === 409) {
          return { ok: false, reason: 'out_of_stock' }
        }
        // Outros erros (ex.: rota de reserva indisponível) -> segue sem bloquear a venda.
      }
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

  const login = (userData, token) => {
    setUser(userData)
    localStorage.setItem('mj_token', token)
    localStorage.setItem('mj_user', JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('mj_token')
    localStorage.removeItem('mj_user')
  }

  return (
    <ToastProvider>
      <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
        <AuthContext.Provider value={{ user, login, logout }}>
          <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount, cartOpen, setCartOpen }}>
            <WishlistContext.Provider value={{ wishlist, toggleWishlist, removeFromWishlist, wishlistOpen, setWishlistOpen }}>
              <SearchContext.Provider value={{ searchProduct, setSearchProduct }}>
                <Header />
                <Suspense fallback={<div style={{ minHeight: '100svh' }} aria-busy="true" />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/produto/:id" element={<Product wishlist={wishlist} onToggleWishlist={toggleWishlist} />} />
                    <Route path="/rastrear" element={<Track />} />
                  </Routes>
                </Suspense>
                <CartDrawer />
                <WishlistDrawer
                       isOpen={wishlistOpen}
                  onClose={() => setWishlistOpen(false)}
                  items={wishlist}
                  onRemove={removeFromWishlist}
                  onAddToCart={(item) => { addToCart(item, parseSizes(item.sizes)[0] || '42'); setWishlistOpen(false); setCartOpen(true) }}
                  onProductClick={(item) => {
                    // no início abre o modal; nas outras páginas vai para a página do produto
                    if (location.pathname === '/') setSearchProduct(item)
                    else navigate(`/produto/${item.id}`)
                  }}
                />
                {!isAdminRoute && location.pathname !== '/' && <Footer />}
                {!isAdminRoute && <BackToTop />}
                {!isAdminRoute && <ChatBot />}
              </SearchContext.Provider>
            </WishlistContext.Provider>
          </CartContext.Provider>
        </AuthContext.Provider>
      </DarkModeContext.Provider>
    </ToastProvider>
  )
}

export default App
