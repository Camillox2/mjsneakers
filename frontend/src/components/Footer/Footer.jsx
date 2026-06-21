import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FiInstagram, FiMail, FiPhone, FiMapPin, FiArrowUpRight } from 'react-icons/fi'
import api from '../../services/api'
import PrivacyModal from '../PrivacyModal/PrivacyModal'
import styles from './Footer.module.css'

export default function Footer() {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [info, setInfo] = useState({
    email: 'contato@mjsneakers.com.br',
    credit: 'Feito por DC Digital Foundry by Vitor Camillo',
    phone: '',
    address: '',
    instagram: '',
  })

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      setInfo({
        email: data.footer_email || data.contact_email || 'contato@mjsneakers.com.br',
        credit: data.footer_credit || 'Feito por DC Digital Foundry by Vitor Camillo',
        phone: data.footer_phone || data.contact_phone || '',
        address: data.footer_address || '',
        instagram: data.footer_instagram || '',
      })
    }).catch(() => {})
  }, [])

  return (
    <>
      <footer className={styles.footer}>
        <div className={styles.footerGlow} aria-hidden="true" />

        <div className={styles.footerInner}>
          {/* Marca */}
          <motion.div
            className={styles.brandCol}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className={styles.footerLogo}>MJ<span>Sneakers</span></div>
            <p className={styles.footerTagline}>
              Os melhores tênis do mercado. 100% originais, envio rápido e troca fácil.
            </p>
            {info.instagram && (
              <a
                className={styles.socialPill}
                href={`https://instagram.com/${info.instagram.replace('@', '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <FiInstagram /> {info.instagram} <FiArrowUpRight />
              </a>
            )}
          </motion.div>

          {/* Navegação */}
          <motion.nav
            className={styles.linksCol}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 }}
          >
            <span className={styles.colTitle}>Navegue</span>
            <a className={styles.footerLink} href="#catalogo">Catálogo</a>
            <a className={styles.footerLink} href="/rastrear">Rastrear Pedido</a>
            <button className={styles.footerLink} onClick={() => setShowPrivacy(true)}>
              Política de Privacidade
            </button>
          </motion.nav>

          {/* Contato */}
          <motion.div
            className={styles.contactCol}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.16 }}
          >
            <span className={styles.colTitle}>Contato</span>
            <a className={styles.contactItem} href={`mailto:${info.email}`}>
              <FiMail /> {info.email}
            </a>
            {info.phone && (
              <span className={styles.contactItem}><FiPhone /> {info.phone}</span>
            )}
            {info.address && (
              <span className={styles.contactItem}><FiMapPin /> {info.address}</span>
            )}
          </motion.div>
        </div>

        <div className={styles.bottomBar}>
          <span className={styles.footerCredit}>
            © {new Date().getFullYear()} MJSneakers · {info.credit}
          </span>
        </div>

        <div className={styles.watermark} aria-hidden="true">MJSNEAKERS</div>
      </footer>

      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  )
}
