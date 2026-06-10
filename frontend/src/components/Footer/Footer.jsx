import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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
        <div className={styles.footerInner}>
          <motion.div
            className={styles.footerLogo}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            MJ<span>Sneakers</span>
          </motion.div>

          <div className={styles.divider} />

          <motion.p
            className={styles.footerEmail}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Contato: <a href={`mailto:${info.email}`}>{info.email}</a>
          </motion.p>

          {info.phone && (
            <motion.p
              className={styles.footerEmail}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
            >
              Telefone: {info.phone}
            </motion.p>
          )}

          {info.instagram && (
            <motion.p
              className={styles.footerEmail}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
            >
              Instagram: <a href={`https://instagram.com/${info.instagram.replace('@', '')}`} target="_blank" rel="noreferrer">{info.instagram}</a>
            </motion.p>
          )}

          <motion.p
            className={styles.footerCredit}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            {info.credit}
          </motion.p>

          <motion.button
            className={styles.privacyLink}
            onClick={() => setShowPrivacy(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Política de Privacidade
          </motion.button>
        </div>
      </footer>

      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  )
}
