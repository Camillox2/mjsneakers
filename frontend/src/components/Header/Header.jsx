import { useContext, useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FiShoppingCart, FiUser, FiLogOut, FiSearch, FiX, FiHeart, FiSun, FiMoon } from 'react-icons/fi'
import { CartContext, AuthContext, SearchContext, WishlistContext, DarkModeContext } from '../../App'
import api from '../../services/api'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './Header.module.css'

export default function Header() {
  const { cartCount, setCartOpen } = useContext(CartContext)
  const { user, logout } = useContext(AuthContext)
  const { setSearchProduct } = useContext(SearchContext)
  const { wishlist, setWishlistOpen } = useContext(WishlistContext)
  const { darkMode, setDarkMode } = useContext(DarkModeContext)
  const navigate = useNavigate()
  const location = useLocation()
  const [logo, setLogo] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    api.get('/settings/site_logo').then(({ data }) => {
      setLogo(data.value)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/products', { params: { search: query } })
        setResults(data.slice(0, 6))
      } catch { setResults([]) }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
        setQuery('')
        setResults([])
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const formatPrice = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <motion.div
          className={styles.logo}
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {logo && <img src={logo} alt="MJ Sneakers" className={styles.logoImg} />}
          <div className={styles.logoText}>
            MJ<span>Sneakers</span>
          </div>
        </motion.div>

        {/* Search */}
        <div className={styles.searchWrap} ref={searchRef}>
          <AnimatePresence>
            {searchOpen && (
              <motion.div className={styles.searchBar} initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                <FiSearch className={styles.searchIcon} />
                <input className={styles.searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar tênis..." autoFocus />
                <button className={styles.searchClose} onClick={() => { setSearchOpen(false); setQuery(''); setResults([]) }}><FiX /></button>
              </motion.div>
            )}
          </AnimatePresence>
          {!searchOpen && (
            <motion.button className={styles.searchBtn} onClick={() => setSearchOpen(true)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <FiSearch />
            </motion.button>
          )}
          {/* Autocomplete dropdown */}
          <AnimatePresence>
            {results.length > 0 && searchOpen && (
              <motion.div className={styles.searchDropdown} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {results.map(p => (
                  <div key={p.id} className={styles.searchResult} onClick={() => { setSearchProduct(p); setSearchOpen(false); setQuery(''); setResults([]); navigate('/') }}>
                    <img className={styles.searchResultImg} src={getImageUrl(p.image_url, p.name)} alt={p.name} />
                    <div className={styles.searchResultInfo}>
                      <span className={styles.searchResultBrand}>{p.brand_name}</span>
                      <span className={styles.searchResultName}>{p.name}</span>
                      <span className={styles.searchResultPrice}>{formatPrice(p.price)}</span>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={styles.headerActions}>
          <motion.button
            className={styles.darkToggle}
            onClick={() => setDarkMode(d => !d)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? <FiSun /> : <FiMoon />}
          </motion.button>

          <motion.button
            className={styles.wishlistBtn}
            onClick={() => setWishlistOpen(true)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Favoritos"
          >
            <FiHeart />
            {wishlist.length > 0 && (
              <motion.span
                className={styles.wishlistBadge}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                key={wishlist.length}
              >
                {wishlist.length}
              </motion.span>
            )}
          </motion.button>

          <motion.button
            className={styles.cartBtn}
            onClick={() => setCartOpen(true)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <FiShoppingCart />
            {cartCount > 0 && (
              <motion.span
                className={styles.cartBadge}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                key={cartCount}
              >
                {cartCount}
              </motion.span>
            )}
          </motion.button>

          {user ? (
            <motion.button
              className={`${styles.adminBtn} ${styles.logged}`}
              onClick={logout}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Sair"
            >              <FiLogOut />
            </motion.button>
          ) : (
            <motion.button
              className={styles.adminBtn}
              onClick={() => navigate('/admin')}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Admin"
            >
              <FiUser />
            </motion.button>
          )}
        </div>
      </div>
    </header>
  )
}
