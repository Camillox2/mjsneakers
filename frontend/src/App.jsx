import { useState, useEffect, createContext } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header/Header'
import Home from './pages/Home/Home'
import Admin from './pages/Admin/Admin'
import Product from './pages/Product/Product'
import CartDrawer from './components/Cart/CartDrawer'
import WishlistDrawer from './components/WishlistDrawer/WishlistDrawer'
import PromotionTicker from './components/PromotionTicker/PromotionTicker'
import { ToastProvider } from './components/Toast/Toast'
import ChatBot from './components/ChatBot/ChatBot'

export const CartContext = createContext()
export const AuthContext = createContext()
export const SearchContext = createContext()
export const WishlistContext = createContext()

function App() {
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [wishlist, setWishlist] = useState([])
  const [wishlistOpen, setWishlistOpen] = useState(false)

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

  const addToCart = (product, size) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === product.id && item.size === size)
      if (exists) {
        return prev.map(item =>
          item.id === product.id && item.size === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { ...product, size, quantity: 1 }]
    })
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

  const clearCart = () => setCart([])

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
      <AuthContext.Provider value={{ user, login, logout }}>
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount, cartOpen, setCartOpen }}>
          <WishlistContext.Provider value={{ wishlist, toggleWishlist, removeFromWishlist, wishlistOpen, setWishlistOpen }}>
            <SearchContext.Provider value={{ searchProduct, setSearchProduct }}>
              <PromotionTicker position="top" />
              <Header />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/produto/:id" element={<Product wishlist={wishlist} onToggleWishlist={toggleWishlist} />} />
              </Routes>
              <CartDrawer />
              <WishlistDrawer
                isOpen={wishlistOpen}
                onClose={() => setWishlistOpen(false)}
                items={wishlist}
                onRemove={removeFromWishlist}
                onAddToCart={(item) => { addToCart(item, item.sizes ? JSON.parse(item.sizes)[0] : '42'); setWishlistOpen(false); setCartOpen(true) }}
                onProductClick={(item) => { setSearchProduct(item) }}
              />
              <ChatBot />
            </SearchContext.Provider>
          </WishlistContext.Provider>
        </CartContext.Provider>
      </AuthContext.Provider>
    </ToastProvider>
  )
}

export default App
