import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiHeart, FiLogOut, FiMenu, FiSearch, FiShoppingBag, FiUser, FiX } from 'react-icons/fi'
import { AuthContext, CartContext, SearchContext, WishlistContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { SAMPLE_PRODUCTS } from '../../data/drops'
import { BRAND } from '../../config/brand'
import { scrollToEl, scrollToY } from '../../lib/motion'
import { cometFlying } from '../../lib/comets'
import styles from './Header.module.css'
import { cachedGet, TTL } from '../../services/cache'

const brl = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Header() {
  const { cartCount, setCartOpen } = useContext(CartContext)
  const { user, logout } = useContext(AuthContext)
  const { setSearchProduct } = useContext(SearchContext)
  const { wishlist, setWishlistOpen } = useContext(WishlistContext)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [bump, setBump] = useState(false)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)
  const lastCount = useRef(cartCount)
  const isHome = location.pathname === '/'

  // a sacola dá um pulo quando entra um par novo; se o par vem num cometa,
  // o pulo espera o cometa chegar (evento 'pz:cart-hit' de lib/comets)
  const bumpTimer = useRef(0)
  const bumpNow = useCallback(() => {
    setBump(false)
    clearTimeout(bumpTimer.current)
    requestAnimationFrame(() => {
      setBump(true)
      bumpTimer.current = setTimeout(() => setBump(false), 650)
    })
  }, [])
  useEffect(() => {
    if (cartCount > lastCount.current && !cometFlying()) bumpNow()
    lastCount.current = cartCount
  }, [cartCount, bumpNow])
  useEffect(() => {
    window.addEventListener('pz:cart-hit', bumpNow)
    return () => {
      window.removeEventListener('pz:cart-hit', bumpNow)
      clearTimeout(bumpTimer.current)
    }
  }, [bumpNow])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return undefined
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await cachedGet('/products', { params: { search: query.trim() }, ttl: TTL.list })
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
        setResults(list.slice(0, 6))
      } catch {
        // sem backend: procura nos exemplares de amostra
        const q = norm(query)
        setResults(SAMPLE_PRODUCTS.filter((p) => norm(`${p.name} ${p.brand_name}`).includes(q)).slice(0, 6))
      }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) closeSearch()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => setMenuOpen(false), [location.pathname])

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
    setResults([])
  }

  const goShop = (e) => {
    e?.preventDefault()
    setMenuOpen(false)
    if (isHome) scrollToEl(document.getElementById('loja'), -70)
    else navigate('/#loja')
  }

  const goTop = (e) => {
    e?.preventDefault()
    setMenuOpen(false)
    if (isHome) scrollToY(0)
    else navigate('/')
  }

  const pick = (p) => {
    setSearchProduct(p)
    closeSearch()
    if (!isHome) navigate('/')
  }

  return (
    <header className={`${styles.header} ${isHome ? styles.overlay : ''}`} data-pz-header>
      <div className={styles.inner}>
        <a href="/" className={styles.logo} onClick={goTop} aria-label={`${BRAND.name}, início`}>
          <img src={BRAND.logoSmall} alt="" className={styles.logoImg} />
        </a>

        <nav className={styles.nav} aria-label="Principal">
          <a href="/" onClick={goTop}>
            Drops
          </a>
          <a href="/#loja" onClick={goShop}>
            Loja
          </a>
          <Link to="/rastrear">Rastrear pedido</Link>
        </nav>

        <div className={styles.actions}>
          <div className={styles.searchWrap} ref={searchRef}>
            <AnimatePresence initial={false}>
              {searchOpen && (
                <motion.div
                  className={styles.searchBar}
                  initial={{ width: 44, opacity: 0 }}
                  animate={{ width: 'var(--search-w)', opacity: 1 }}
                  exit={{ width: 44, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <FiSearch className={styles.searchIcon} aria-hidden="true" />
                  <input
                    className={styles.searchInput}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                    placeholder="Buscar tênis"
                    aria-label="Buscar tênis"
                    autoFocus
                  />
                  <button type="button" className={styles.searchClose} onClick={closeSearch} aria-label="Fechar busca">
                    <FiX />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {!searchOpen && (
              <button type="button" className={styles.iconBtn} onClick={() => setSearchOpen(true)} aria-label="Buscar">
                <FiSearch />
              </button>
            )}
            <AnimatePresence>
              {searchOpen && results.length > 0 && (
                <motion.ul
                  className={styles.results}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {results.map((p) => (
                    <li key={p.id}>
                      <button type="button" className={styles.result} onClick={() => pick(p)}>
                        <img src={getImageUrl(p.image_url, p.name)} alt="" className={p.fit === 'contain' ? styles.resultContain : ''} />
                        <span className={styles.resultText}>
                          <span className={styles.resultName}>{p.name}</span>
                          <span className={styles.resultMeta}>{brl(p.price)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <button type="button" className={`${styles.iconBtn} ${styles.hideSm}`} onClick={() => setWishlistOpen(true)} aria-label={`Favoritos (${wishlist.length})`}>
            <FiHeart />
            {wishlist.length > 0 && <span className={styles.badge}>{wishlist.length}</span>}
          </button>

          <button type="button" data-pz-cart className={`${styles.iconBtn} ${bump ? styles.bump : ''}`} onClick={() => setCartOpen(true)} aria-label={`Sacola (${cartCount})`}>
            <FiShoppingBag />
            {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
          </button>

          {user ? (
            <button type="button" className={`${styles.iconBtn} ${styles.hideSm}`} onClick={logout} aria-label="Sair">
              <FiLogOut />
            </button>
          ) : (
            <button type="button" className={`${styles.iconBtn} ${styles.hideSm}`} onClick={() => navigate('/admin')} aria-label="Painel da loja">
              <FiUser />
            </button>
          )}

          <button type="button" className={`${styles.iconBtn} ${styles.menuBtn}`} onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Menu">
            {menuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            className={styles.sheet}
            aria-label="Menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <a href="/" onClick={goTop}>
              Drops
            </a>
            <a href="/#loja" onClick={goShop}>
              Loja
            </a>
            <Link to="/rastrear">Rastrear pedido</Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setWishlistOpen(true)
              }}
            >
              Favoritos {wishlist.length > 0 && `(${wishlist.length})`}
            </button>
            <Link to="/admin">Painel da loja</Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
