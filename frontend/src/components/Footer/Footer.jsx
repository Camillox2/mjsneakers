import { useState } from 'react'
import { motion } from 'framer-motion'
import PrivacyModal from '../PrivacyModal/PrivacyModal'
import styles from './Footer.module.css'

export default function Footer() {
  const [showPrivacy, setShowPrivacy] = useState(false)

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
            Contato: <a href="mailto:contato@mjsneakers.com.br">contato@mjsneakers.com.br</a>
          </motion.p>

          <motion.p
            className={styles.footerCredit}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            Feito por DC Digital Foundry by Vitor Camillo
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
