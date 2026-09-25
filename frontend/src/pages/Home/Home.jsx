import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { SearchContext } from '../../App'
import { GRID_SAMPLES, SAMPLE_PRODUCTS } from '../../data/drops'
import { mergeBrands, sameBrand } from '../../data/brands'
import DropReel from './DropReel'
import ShopIntro from './ShopIntro'
import FeaturedDrop from './FeaturedDrop'
import Shop from './Shop'
import OnFeet from './OnFeet'
import TrustStrip from '../../components/TrustStrip/TrustStrip'
import BannerCarousel from '../../components/BannerCarousel/BannerCarousel'
import PromotionTicker from '../../components/PromotionTicker/PromotionTicker'
import ProductModal from '../../components/ProductModal/ProductModal'
import RecentlyViewed from '../../components/RecentlyViewed/RecentlyViewed'
import Newsletter from '../../components/Newsletter/Newsletter'
import BottomPromoBanner from '../../components/BottomPromoBanner/BottomPromoBanner'
import Footer from '../../components/Footer/Footer'
import { cachedGet, TTL } from '../../services/cache'
import { prefersReducedMotion, scrollToEl } from '../../lib/motion'
import styles from './Home.module.css'

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [apiBrands, setApiBrands] = useState([])
  const [brand, setBrand] = useState(null)
  const [shopStatus, setShopStatus] = useState({ samples: false, count: 0 })
  const { searchProduct, setSearchProduct } = useContext(SearchContext)
  const shopRef = useRef(null)

  useEffect(() => {
    if (searchProduct) {
      setSelectedProduct(searchProduct)
      setSearchProduct(null)
    }
  }, [searchProduct, setSearchProduct])

  useEffect(() => {
    cachedGet('/brands', { ttl: TTL.config, persist: true })
      .then((data) => Array.isArray(data) && setApiBrands(data))
      .catch(() => {})
  }, [])

  // marcas do backend; na vitrine de amostras, a lista da loja + a marca das amostras
  const brands = useMemo(() => {
    const sampleNames = shopStatus.samples ? [...new Set(GRID_SAMPLES.map((p) => p.brand_name))] : []
    return mergeBrands(apiBrands, sampleNames)
  }, [apiBrands, shopStatus.samples])

  // pares que a órbita usa para mostrar o tênis e contar cada marca: as
  // amostras, ou a primeira página do catálogo real (mesmo pedido da vitrine,
  // então vem do cache)
  const [realProducts, setRealProducts] = useState([])
  useEffect(() => {
    if (shopStatus.samples) return
    cachedGet('/products', { params: { page: 1, limit: 20 }, ttl: TTL.list })
      .then((data) => setRealProducts(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [shopStatus.samples])
  const orbitProducts = shopStatus.samples ? GRID_SAMPLES : realProducts

  const shoeFor = useCallback(
    (name) => {
      const list = name ? orbitProducts.filter((p) => sameBrand(p.brand_name, name)) : orbitProducts
      if (name && !list.length) return null
      return list.find((p) => p.spin) ?? list[0] ?? null
    },
    [orbitProducts],
  )
  const countFor = useCallback((name) => orbitProducts.filter((p) => sameBrand(p.brand_name, name)).length, [orbitProducts])

  const onShopStatus = useCallback((status) => {
    setShopStatus((prev) => (prev.samples === status.samples && prev.count === status.count ? prev : status))
  }, [])

  // O DropReel põe a classe pz-intro (header escondido) só quando há abertura
  // animada; aqui ela sai quando a abertura termina.
  const introDone = useCallback(() => {
    document.documentElement.classList.remove('pz-intro')
    // veio de outra página pelo link "Loja": vai direto para a vitrine
    if (window.location.hash === '#loja') scrollToEl(document.getElementById('loja'))
  }, [])

  // marca escolhida na órbita: filtra a vitrine; o botão embaixo leva até ela
  const seeBrand = useCallback(() => scrollToEl(shopRef.current), [])

  // "Quero esse" no giro: abre o produto real se o drop estiver ligado a um
  // produto do backend; senão, o exemplar de amostra.
  const pickDrop = useCallback(async (drop) => {
    if (drop.productId) {
      try {
        const data = await cachedGet(`/products/${drop.productId}`, { ttl: TTL.item })
        if (data?.id) {
          setSelectedProduct(data)
          return
        }
      } catch {
        /* cai para a amostra */
      }
    }
    setSelectedProduct(SAMPLE_PRODUCTS.find((p) => p.spin === drop.id) ?? null)
  }, [])

  return (
    <main className={styles.home}>
      <DropReel onPick={pickDrop} onIntroDone={introDone} catalogRef={shopRef} />

      <div id="loja">
        <PromotionTicker position="top" />
        <ShopIntro
          brands={brands}
          active={brand}
          onBrand={setBrand}
          count={shopStatus.count}
          shoeFor={shoeFor}
          countFor={countFor}
          onSeeAll={seeBrand}
        />
      </div>

      <BannerCarousel />

      <FeaturedDrop onOpen={setSelectedProduct} />

      <div ref={shopRef}>
        <Shop onProductClick={setSelectedProduct} brands={brands} brand={brand} onBrand={setBrand} onStatus={onShopStatus} />
      </div>

      <RecentlyViewed onProductClick={setSelectedProduct} />

      <OnFeet onOpen={setSelectedProduct} />

      <TrustStrip />

      <BottomPromoBanner onProductClick={setSelectedProduct} />

      <section className={styles.newsletter} aria-label="Newsletter">
        <OrbitBackdrop />
        <div className={styles.newsletterInner} data-orbit-avoid>
          <Newsletter variant="footer" />
        </div>
      </section>

      <ProductModal product={selectedProduct} isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} />

      <Footer />
    </main>
  )
}

// Órbita desenhada atrás da newsletter, com um ponto de luz correndo nela:
// a mesma assinatura visual do giro, fechando a página.
// O ponto é um elemento à parte, animado por transform (Web Animations): quem
// move é a placa de vídeo. Com o animateMotion do SVG + sombra em filtro, o
// navegador redesenhava o fundo inteiro a cada quadro e as linhas tremiam.
// A órbita contorna o texto: na faixa do título e do formulário ela some
// (máscara). Passando por trás das letras, o ponto de luz piscava entre elas.
const ORBIT_VB = { w: 1200, h: 400, cx: 600, cy: 200, rx: 540, ry: 150, tilt: -4 }
const ORBIT_LAP = 14000 // ms por volta

function OrbitBackdrop() {
  const wrapRef = useRef(null)
  const dotRef = useRef(null)
  const { w: VW, h: VH, cx, cy, rx, ry, tilt } = ORBIT_VB

  useEffect(() => {
    const wrap = wrapRef.current
    const dot = dotRef.current
    if (!wrap) return undefined
    const moving = !prefersReducedMotion() && !!dot?.animate
    let anim = null
    let visible = false

    // faixa do conteúdo, em % da altura da seção: a máscara apaga a órbita ali
    const band = () => {
      const section = wrap.parentElement
      const inner = section?.querySelector('[data-orbit-avoid]')
      const H = section?.clientHeight
      if (!inner || !H) return
      wrap.style.setProperty('--band-top', `${((inner.offsetTop / H) * 100).toFixed(1)}%`)
      wrap.style.setProperty('--band-bottom', `${(((inner.offsetTop + inner.offsetHeight) / H) * 100).toFixed(1)}%`)
    }

    // pontos da elipse (já girada) a passos iguais de comprimento: velocidade
    // constante, como o animateMotion fazia
    const build = () => {
      band()
      if (!moving) return
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      if (!W || !H) return
      const sx = W / VW // preserveAspectRatio "none": cada eixo na sua escala
      const sy = H / VH
      const a = (tilt * Math.PI) / 180
      const dense = []
      for (let k = 0; k <= 720; k += 1) {
        const th = Math.PI + (k / 720) * Math.PI * 2 // começa na ponta esquerda e sobe
        const dx = rx * Math.cos(th)
        const dy = ry * Math.sin(th)
        dense.push([(cx + dx * Math.cos(a) - dy * Math.sin(a)) * sx, (cy + dx * Math.sin(a) + dy * Math.cos(a)) * sy])
      }
      const len = [0]
      for (let k = 1; k < dense.length; k += 1) len.push(len[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]))
      const total = len[len.length - 1]
      const frames = []
      let j = 0
      for (let k = 0; k <= 120; k += 1) {
        const want = (k / 120) * total
        while (j < len.length - 2 && len[j + 1] < want) j += 1
        const t = (want - len[j]) / Math.max(len[j + 1] - len[j], 1e-6)
        const x = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * t
        const y = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * t
        frames.push({ transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)` })
      }
      const at = anim?.currentTime ?? 0
      anim?.cancel()
      anim = dot.animate(frames, { duration: ORBIT_LAP, iterations: Infinity, easing: 'linear' })
      anim.currentTime = at
      if (!visible) anim.pause()
      dot.style.opacity = '1'
    }

    build()
    const ro = new ResizeObserver(build)
    ro.observe(wrap)
    // fora da tela o ponto para (não gasta nada da placa de vídeo)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) anim?.play()
      else anim?.pause()
    })
    io.observe(wrap)
    return () => {
      ro.disconnect()
      io.disconnect()
      anim?.cancel()
    }
  }, [VW, VH, cx, cy, rx, ry, tilt])

  const path = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`
  return (
    <div ref={wrapRef} className={styles.orbit} aria-hidden="true">
      <svg className={styles.orbitSvg} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
        <g transform={`rotate(${tilt} ${cx} ${cy})`}>
          <path d={path} className={styles.orbitLine} />
          <ellipse cx={cx} cy={cy} rx="585" ry="182" className={styles.orbitDash} />
        </g>
      </svg>
      <span ref={dotRef} className={styles.orbitDot} />
    </div>
  )
}
