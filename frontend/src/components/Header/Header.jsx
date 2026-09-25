import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiHeart, FiMenu, FiSearch, FiShoppingBag, FiUser, FiX } from 'react-icons/fi'
import { CartContext, SearchContext, WishlistContext } from '../../App'
import { useAccount } from '../../lib/AccountContext'
import { getImageUrl } from '../../utils/imageHelper'
import { SAMPLE_PRODUCTS } from '../../data/drops'
import { BRAND } from '../../config/brand'
import { scrollToEl, scrollToY } from '../../lib/motion'
import { cometFlying } from '../../lib/comets'
import { useScrollLock } from '../../lib/useScrollLock'
import { useBackToClose } from '../../lib/layers'
import styles from './Header.module.css'
import { cachedGet, TTL } from '../../services/cache'

const brl = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const EASE = [0.22, 1, 0.36, 1]

export default function Header() {
  const { cartCount, setCartOpen } = useContext(CartContext)
  // conta do cliente: o ícone de pessoa leva para /conta (logado, com um ponto)
  const { loggedIn: customerIn } = useAccount()
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

  // menu do celular: a página para atrás dele, e o voltar do celular fecha
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useScrollLock(menuOpen)
  useBackToClose(menuOpen, closeMenu)

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

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
    setResults([])
  }, [])

  // toque ou clique fora da busca fecha a busca
  useEffect(() => {
    if (!searchOpen) return undefined
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) closeSearch()
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [searchOpen, closeSearch])

  // Esc fecha o menu
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => setMenuOpen(false), [location.pathname])

  const openSearch = () => {
    setMenuOpen(false)
    setSearchOpen(true)
  }

  const goShop = (e) => {
    e?.preventDefault()
    setMenuOpen(false)
    if (isHome) scrollToEl(document.getElementById('loja'))
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
    <>
      <header className={`${styles.header} ${isHome ? styles.overlay : ''} ${menuOpen ? styles.menuOpen : ''}`} data-pz-header>
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
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <FiSearch className={styles.searchIcon} aria-hidden="true" />
                    <input
                      className={styles.searchInput}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                      placeholder="Buscar tênis"
                      aria-label="Buscar tênis"
                      enterKeyHint="search"
                      autoComplete="off"
                      autoFocus
                    />
                    <button type="button" className={styles.searchClose} onClick={closeSearch} aria-label="Fechar busca">
                      <FiX />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              {!searchOpen && (
                <button type="button" className={styles.iconBtn} onClick={openSearch} aria-label="Buscar">
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
                    data-lenis-prevent
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

            <Link
              to="/conta"
              className={`${styles.iconBtn} ${customerIn ? styles.signedIn : ''}`}
              aria-label={customerIn ? 'Minha conta' : 'Entrar na minha conta'}
              onClick={() => setMenuOpen(false)}
            >
              <FiUser />
            </Link>

            <button
              type="button"
              data-pz-cart
              className={`${styles.iconBtn} ${bump ? styles.bump : ''}`}
              onClick={() => {
                setMenuOpen(false)
                setCartOpen(true)
              }}
              aria-label={`Sacola (${cartCount})`}
            >
              <FiShoppingBag />
              {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
            </button>

            <button
              type="button"
              className={`${styles.iconBtn} ${styles.menuBtn}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="menu-loja"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuOpen ? <FiX /> : <FiMenu />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              id="menu-loja"
              className={styles.sheet}
              aria-label="Menu"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: EASE }}
              data-lenis-prevent
            >
              <a href="/" onClick={goTop}>
                Drops
              </a>
              <a href="/#loja" onClick={goShop}>
                Loja
              </a>
              <Link to="/rastrear">Rastrear pedido</Link>
              <Link to="/conta">{customerIn ? 'Minha conta' : 'Entrar'}</Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setWishlistOpen(true)
                }}
              >
                Favoritos {wishlist.length > 0 && <span className={styles.sheetCount}>{wishlist.length}</span>}
              </button>
              <Link to="/admin" className={styles.sheetMinor}>Painel da loja</Link>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* fundo do menu: toque fora fecha. Fora do header, porque o vidro dele
          prenderia um position: fixed dentro da própria caixa */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className={styles.scrim}
            onClick={closeMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </>
  )
}
