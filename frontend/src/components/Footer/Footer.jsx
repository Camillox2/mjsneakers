import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiInstagram, FiMail, FiPhone, FiMapPin, FiArrowUpRight, FiClock } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { scrollToEl, scrollToY } from '../../lib/motion'
import ChromeLogo from '../ChromeLogo/ChromeLogo'
import styles from './Footer.module.css'
import { cachedGet, TTL } from '../../services/cache'
import { formatCnpj, loadLegal } from '../../lib/legal'

export default function Footer() {
  const { pathname } = useLocation()
  // quem vende (Decreto 7.962/2013): razão social, CNPJ, endereço e atendimento
  const [company, setCompany] = useState(null)
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
    loadLegal().then((data) => setCompany(data.company)).catch(() => {})
  }, [])

  // A vitrine (#loja) mora na página inicial; lá a rolagem passa pelo Lenis.
  const goShop = (e) => {
    const shop = document.getElementById('loja')
    if (!shop) return // fora do início: o link leva para /#loja
    e.preventDefault()
    scrollToEl(shop)
  }

  const goTop = (e) => {
    if (pathname !== '/') return
    e.preventDefault()
    scrollToY(0)
  }

  const handle = info.instagram.replace('@', '').trim()
  // contato: o que o admin preencheu nos dados legais, senão o das configurações
  const email = company?.email || info.email
  const phone = company?.phone || info.phone
  const address = company?.address || info.address
  const hours = company?.hours || ''
  const legalLine = company
    ? [
        company.company_name,
        company.trade_name && company.trade_name !== company.company_name ? company.trade_name : '',
        company.cnpj ? `CNPJ ${formatCnpj(company.cnpj)}` : '',
      ].filter(Boolean)
    : []

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
            <Link className={styles.footerLink} to="/conta">Minha conta</Link>
          </nav>

          {/* Ajuda e políticas */}
          <nav className={styles.linksCol} aria-label="Políticas">
            <h2 className={styles.colTitle}>Ajuda</h2>
            <Link className={styles.footerLink} to="/termos">Termos de uso</Link>
            <Link className={styles.footerLink} to="/trocas-e-devolucoes">Trocas e devoluções</Link>
            <Link className={styles.footerLink} to="/privacidade">Privacidade</Link>
            <Link className={styles.footerLink} to="/meus-dados">Meus dados</Link>
          </nav>

          {/* Contato */}
          <div className={styles.contactCol}>
            <h2 className={styles.colTitle}>Contato</h2>
            {email && (
              <a className={styles.contactItem} href={`mailto:${email}`}>
                <FiMail aria-hidden="true" /> <span>{email}</span>
              </a>
            )}
            {phone && (
              <a className={styles.contactItem} href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                <FiPhone aria-hidden="true" /> <span>{phone}</span>
              </a>
            )}
            {hours && (
              <span className={styles.contactItem}>
                <FiClock aria-hidden="true" /> <span>{hours}</span>
              </span>
            )}
            {address && (
              <span className={styles.contactItem}>
                <FiMapPin aria-hidden="true" /> <span>{address}</span>
              </span>
            )}
          </div>
        </div>

        <div className={styles.bottomBar}>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
          {legalLine.length > 0 && <span className={styles.legalLine}>{legalLine.join(' · ')}</span>}
          <span>{info.credit}</span>
        </div>

        {/* assinatura: o logo cromado de ponta a ponta, com o reflexo passando */}
        <div className={styles.giant} aria-hidden="true">
          <ChromeLogo />
        </div>
      </footer>

    </>
  )
}
