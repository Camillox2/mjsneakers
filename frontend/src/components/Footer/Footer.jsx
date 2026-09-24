import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiInstagram, FiMail, FiPhone, FiMapPin, FiArrowUpRight } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { scrollToEl, scrollToY } from '../../lib/motion'
import ChromeLogo from '../ChromeLogo/ChromeLogo'
import PrivacyModal from '../PrivacyModal/PrivacyModal'
import styles from './Footer.module.css'
import { cachedGet, TTL } from '../../services/cache'

export default function Footer() {
  const { pathname } = useLocation()
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [info, setInfo] = useState({
    email: 'contato@pizzant.com.br',
    credit: 'Feito por DC Digital Foundry by Vitor Camillo',
    phone: '',
    address: '',
    instagram: '',
  })

  useEffect(() => {
    cachedGet('/settings', { ttl: TTL.config, persist: true }).then((data = {}) => {
      setInfo({
        email: data.footer_email || data.contact_email || 'contato@pizzant.com.br',
        credit: data.footer_credit || 'Feito por DC Digital Foundry by Vitor Camillo',
        phone: data.footer_phone || data.contact_phone || '',
        address: data.footer_address || '',
        instagram: data.footer_instagram || '',
      })
    }).catch(() => {})
  }, [])

  // A vitrine (#loja) mora na página inicial; lá a rolagem passa pelo Lenis.
  const goShop = (e) => {
    const shop = document.getElementById('loja')
    if (!shop) return // fora do início: o link leva para /#loja
    e.preventDefault()
    scrollToEl(shop, -70)
  }

  const goTop = (e) => {
    if (pathname !== '/') return
    e.preventDefault()
    scrollToY(0)
  }

  const handle = info.instagram.replace('@', '').trim()

  return (
    <>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {/* Marca */}
          <div className={styles.brandCol}>
            <Link to="/" className={styles.logo} onClick={goTop} aria-label={`${BRAND.name}, início`}>
              <ChromeLogo small shine={false} />
            </Link>
            <p className={styles.footerTagline}>
              Tênis de drop, 100% originais. Envio rápido e troca fácil.
            </p>
            {handle && (
              <a
                className={styles.socialPill}
                href={`https://instagram.com/${handle}`}
                target="_blank"
                rel="noreferrer"
              >
                <FiInstagram aria-hidden="true" /> @{handle} <FiArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>

          {/* Navegação */}
          <nav className={styles.linksCol} aria-label="Rodapé">
            <h2 className={styles.colTitle}>Navegue</h2>
            <a className={styles.footerLink} href="/#loja" onClick={goShop}>Loja</a>
            <Link className={styles.footerLink} to="/rastrear">Rastrear pedido</Link>
            <button type="button" className={styles.footerLink} onClick={() => setShowPrivacy(true)}>
              Política de privacidade
            </button>
          </nav>

          {/* Contato */}
          <div className={styles.contactCol}>
            <h2 className={styles.colTitle}>Contato</h2>
            <a className={styles.contactItem} href={`mailto:${info.email}`}>
              <FiMail aria-hidden="true" /> <span>{info.email}</span>
            </a>
            {info.phone && (
              <a className={styles.contactItem} href={`tel:${info.phone.replace(/[^\d+]/g, '')}`}>
                <FiPhone aria-hidden="true" /> <span>{info.phone}</span>
              </a>
            )}
            {info.address && (
              <span className={styles.contactItem}>
                <FiMapPin aria-hidden="true" /> <span>{info.address}</span>
              </span>
            )}
          </div>
        </div>

        <div className={styles.bottomBar}>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
          <span>{info.credit}</span>
        </div>

        {/* assinatura: o logo cromado de ponta a ponta, com o reflexo passando */}
        <div className={styles.giant} aria-hidden="true">
          <ChromeLogo />
        </div>
      </footer>

      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  )
}
