import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { FiHeart, FiTrash2 } from 'react-icons/fi'
import { WishlistContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { brl } from '../../lib/format'
import styles from './Account.module.css'

// Favoritos da conta: os mesmos do coração da vitrine. Logado, eles vão e
// voltam do servidor (a sincronia fica no App).
export default function FavoritesTab() {
  const { wishlist, removeFromWishlist } = useContext(WishlistContext)

  if (!wishlist.length) {
    return (
      <div className={styles.emptyBox}>
        <span className={styles.emptyIcon} aria-hidden="true"><FiHeart /></span>
        <p className={styles.emptyTitle}>Nenhum favorito ainda</p>
        <p className={styles.empty}>Toque no coração de um tênis e ele fica guardado aqui, em qualquer aparelho em que você entrar.</p>
        <Link to="/#loja" className="pz-btn-ghost">Ver a loja</Link>
      </div>
    )
  }

  return (
    <ul className={styles.favs}>
      {wishlist.map((p) => {
        const pct = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
        const price = pct > 0 ? Number(p.price) * (1 - pct / 100) : Number(p.price)
        return (
          <li key={p.id} className={styles.fav}>
            <Link to={`/produto/${p.id}`} className={`${styles.favImg} ${p.fit === 'contain' ? styles.favContain : ''}`} style={{ '--glow': p.glow || '#cdd1d8' }}>
              <img src={getImageUrl(p.image_url, p.name)} alt="" loading="lazy" />
            </Link>
            <div className={styles.favInfo}>
              {p.brand_name && <span className={styles.favBrand}>{p.brand_name}</span>}
              <Link to={`/produto/${p.id}`} className={styles.favName}>{p.name}</Link>
              <span className={styles.favPrice}>{brl(price)}</span>
            </div>
            <button type="button" className={styles.iconBtn} onClick={() => removeFromWishlist(p.id)} aria-label={`Tirar ${p.name} dos favoritos`}>
              <FiTrash2 aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
