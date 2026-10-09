import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import ProductCard from '../../components/ProductCard/ProductCard'
import ProductModal from '../../components/ProductModal/ProductModal'
import PromoBanner from '../../components/PromoRail/PromoBanner'
import SkeletonGrid from '../../components/Skeleton/Skeleton'
import { useDragScroll } from '../../lib/useDragScroll'
import { discountOf, fetchPromos } from '../../lib/promos'
import { sameBrand } from '../../data/brands'
import styles from './Promos.module.css'

const EASE = [0.22, 1, 0.36, 1]
const SORTS = [
  { value: 'discount', label: 'Maior desconto' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'ending', label: 'Acabando antes' },
]
const final = (p) => Number(p.price) * (1 - discountOf(p) / 100)
const endOf = (p) => (p.promo_end ? new Date(p.promo_end).getTime() : Infinity)

// /promocoes: tudo o que está com desconto valendo, com a faixa animada no topo.
export default function Promos() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | done | error
  const [brand, setBrand] = useState('')
  const [sort, setSort] = useState('discount')
  const [selected, setSelected] = useState(null)
  const brandsRef = useRef(null)

  useEffect(() => {
    document.title = 'Promoções | Pizantt'
    let alive = true
    fetchPromos()
      .then((list) => {
        if (!alive) return
        setItems(list)
        setStatus('done')
      })
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [])

  const brands = useMemo(() => {
    const names = []
    items.forEach((p) => {
      if (p.brand_name && !names.some((n) => sameBrand(n, p.brand_name))) names.push(p.brand_name)
    })
    return names.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [items])
  useDragScroll(brandsRef, brands.length > 1)

  const list = useMemo(() => {
    let out = brand ? items.filter((p) => sameBrand(p.brand_name, brand)) : items
    if (sort === 'price_asc') out = [...out].sort((a, b) => final(a) - final(b))
    else if (sort === 'price_desc') out = [...out].sort((a, b) => final(b) - final(a))
    else if (sort === 'ending') out = [...out].sort((a, b) => endOf(a) - endOf(b) || discountOf(b) - discountOf(a))
    return out
  }, [items, brand, sort])

  const maxOff = items.length ? Math.max(...items.map(discountOf)) : 0

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          <PromoBanner
            size="hero"
            count={items.length}
            maxOff={maxOff}
            lead="Os pares com desconto agora na Pizantt. O preço riscado é o de sempre; o de baixo é o que você paga."
          />
        </motion.div>

        {status === 'done' && items.length > 0 && (
          <div className={styles.bar}>
            <div ref={brandsRef} className={styles.brands} role="group" aria-label="Marcas em promoção">
              <button type="button" className={`${styles.pill} ${!brand ? styles.pillOn : ''}`} aria-pressed={!brand} onClick={() => setBrand('')}>
                Todas
              </button>
              {brands.map((b) => (
                <button key={b} type="button" className={`${styles.pill} ${brand === b ? styles.pillOn : ''}`} aria-pressed={brand === b} onClick={() => setBrand(brand === b ? '' : b)}>
                  {b}
                </button>
              ))}
            </div>
            <label className={styles.sort}>
              <span className="pz-visually-hidden">Ordenar por</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
            </label>
          </div>
        )}

        {status === 'loading' ? (
          <div className={styles.gridWrap}><SkeletonGrid count={8} /></div>
        ) : list.length > 0 ? (
          <div className={styles.grid}>
            {list.map((p, i) => (
              <div key={p.id} className={styles.cell}>
                <ProductCard product={p} index={i % 8} onClick={setSelected} promo />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {status === 'error' ? 'Não deu para carregar as promoções agora.' : 'Nenhuma promoção no ar neste momento.'}
            </p>
            <p className={styles.emptySub}>
              {status === 'error' ? 'Confira a conexão e tente de novo em instantes.' : 'Novas ofertas entram toda semana. Enquanto isso, veja a vitrine inteira.'}
            </p>
            <Link to="/#loja" className="pz-btn-ghost">Ver a vitrine</Link>
          </div>
        )}
      </div>

      <ProductModal product={selected} isOpen={!!selected} onClose={() => setSelected(null)} />
    </main>
  )
}
