import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiHeart, FiX, FiTrash2, FiShoppingBag, FiInfo } from 'react-icons/fi'
import { getImageUrl } from '../../utils/imageHelper'
import { parseSizes } from '../../utils/sizes'
import { isSample } from '../../data/drops'
import { lockScroll } from '../../lib/motion'
import { useBackToClose } from '../../lib/layers'
import { useToast } from '../Toast/Toast'
import styles from './WishlistDrawer.module.css'

const EASE = [0.22, 1, 0.36, 1]
const isSampleItem = (p) => isSample(p) || String(p?.id ?? '').startsWith('amostra-')

export default function WishlistDrawer({ isOpen, onClose, items, onRemove, onAddToCart, onProductClick }) {
  const addToast = useToast()
  const formatPrice = (p) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)
  // qual favorito está com a escolha de tamanho aberta (a sacola pede tamanho)
  const [picking, setPicking] = useState(null)
  const [adding, setAdding] = useState(null)

  // onClose chega como função nova a cada render do App; a ref evita
  // destravar e travar a rolagem de novo a cada render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useBackToClose(isOpen, () => closeRef.current?.())

  // Esc fecha; a página atrás fica parada enquanto a gaveta está aberta
  useEffect(() => {
    if (!isOpen) {
      setPicking(null)
      return undefined
    }
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', onKey)
    lockScroll(true)
    return () => {
      window.removeEventListener('keydown', onKey)
      lockScroll(false)
    }
  }, [isOpen])

  const open = (item) => {
    onProductClick && onProductClick(item)
    onClose()
  }

  const addSize = async (item, size) => {
    if (adding) return
    setAdding(`${item.id}-${size}`)
    const result = await onAddToCart?.(item, size)
    setAdding(null)
    if (result?.ok) {
      setPicking(null)
      addToast(`${item.name}, tamanho ${size}, foi para a sacola.`, 'success')
    } else if (result?.reason === 'out_of_stock') {
      addToast(`O ${size} acabou de esgotar. Escolha outro.`, 'error')
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={onClose}
            />
            <motion.aside
              className={styles.drawer}
              role="dialog"
              aria-modal="true"
              aria-labelledby="favoritos-titulo"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <div className={styles.header}>
                <div className={styles.headerLeft}>
                  <h2 id="favoritos-titulo">Favoritos</h2>
                  {items.length > 0 && <span className={styles.count}>{items.length}</span>}
                </div>
                <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar favoritos">
                  <FiX aria-hidden="true" />
                </button>
              </div>

              {items.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon} aria-hidden="true"><FiHeart /></span>
                  <p>Nenhum favorito ainda</p>
                  <span>Toque no coração de um tênis para guardar ele aqui.</span>
                  <button type="button" className="pz-btn-ghost" onClick={onClose}>Ver a loja</button>
                </div>
              ) : (
                <ul className={styles.list} data-lenis-prevent>
                  {items.map(item => {
                    const discount = Math.min(Math.max(Number(item.discount_percentage || 0), 0), 90)
                    const finalPrice = discount > 0 ? Number(item.price) * (1 - discount / 100) : Number(item.price)
                    const contain = item.fit === 'contain'
                    const sample = isSampleItem(item)
                    const sizes = parseSizes(item.sizes)
                    const choosing = picking === item.id

                    return (
                      <li key={item.id} className={styles.item}>
                        <div className={styles.row}>
                          <button
                            type="button"
                            className={`${styles.thumb} ${contain ? styles.thumbContain : ''}`}
                            style={{ '--glow': item.glow || '#cdd1d8' }}
                            onClick={() => open(item)}
                            tabIndex={-1}
                            aria-hidden="true"
                          >
                            <img className={styles.image} src={getImageUrl(item.image_url, item.name)} alt="" loading="lazy" />
                          </button>
                          <div className={styles.info}>
                            {item.brand_name && <span className={styles.brand}>{item.brand_name}</span>}
                            <button type="button" className={styles.name} onClick={() => open(item)}>
                              {item.name}
                            </button>
                            <div className={styles.priceRow}>
                              <span className={styles.price}>{formatPrice(finalPrice)}</span>
                              {discount > 0 && <span className={styles.oldPrice}>{formatPrice(item.price)}</span>}
                            </div>
                            {item.stock === 0 && <span className={styles.outOfStock}>Esgotado</span>}
                          </div>
                          <div className={styles.actions}>
                            {item.stock > 0 && !sample && (
                              <button
                                type="button"
                                className={`${styles.iconBtn} ${styles.cartBtn} ${choosing ? styles.cartBtnOn : ''}`}
                                onClick={() => setPicking(choosing ? null : item.id)}
                                aria-expanded={choosing}
                                aria-label={`Escolher o tamanho de ${item.name} para a sacola`}
                              >
                                <FiShoppingBag aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.removeBtn}`}
                              onClick={() => onRemove && onRemove(item.id)}
                              aria-label={`Tirar ${item.name} dos favoritos`}
                            >
                              <FiTrash2 aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {sample && (
                          <p className={styles.soon}>
                            <FiInfo aria-hidden="true" /> Amostra da vitrine, ainda não está à venda.
                          </p>
                        )}

                        <AnimatePresence initial={false}>
                          {choosing && (
                            <motion.div
                              className={styles.sizes}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.28, ease: EASE }}
                            >
                              <div className={styles.sizesInner}>
                                <span className={styles.sizesLabel}>Qual tamanho vai para a sacola?</span>
                                {sizes.length > 0 ? (
                                  <div className={styles.sizeGrid} role="group" aria-label={`Tamanhos de ${item.name}`}>
                                    {sizes.map((s) => (
                                      <button
                                        key={s}
                                        type="button"
                                        className={styles.size}
                                        onClick={() => addSize(item, s)}
                                        disabled={Boolean(adding)}
                                        aria-label={`Colocar o tamanho ${s} na sacola`}
                                      >
                                        {adding === `${item.id}-${s}` ? '…' : s}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <button type="button" className="pz-btn-ghost" onClick={() => open(item)}>
                                    Ver o par
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    )
                  })}
                </ul>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
