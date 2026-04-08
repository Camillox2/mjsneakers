import { useState, useEffect, createContext } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header/Header'
import Home from './pages/Home/Home'
import Admin from './pages/Admin/Admin'
import CartDrawer from './components/Cart/CartDrawer'
import { ToastProvider } from './components/Toast/Toast'
import ChatBot from './components/ChatBot/ChatBot'

export const CartContext = createContext()
export const AuthContext = createContext()
export const SearchContext = createContext()

function App() {
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const savedCart = localStorage.getItem('mj_cart')
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)) } catch {}
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

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
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
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, cartTotal, cartCount, cartOpen, setCartOpen }}>
          <SearchContext.Provider value={{ searchProduct, setSearchProduct }}>
            <Header />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
            <CartDrawer />
            <ChatBot />
          </SearchContext.Provider>
        </CartContext.Provider>
      </AuthContext.Provider>
    </ToastProvider>
  )
}

export default App
