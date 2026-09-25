import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiMail, FiShield } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import Markdown from '../../components/Markdown/Markdown'
import { LEGAL_PAGES, formatLegalDate, loadLegal } from '../../lib/legal'
import styles from './LegalPage.module.css'

// Páginas legais (/termos, /trocas-e-devolucoes, /privacidade). O texto vem
// do admin em markdown simples e vira elementos React (sem HTML cru).
export default function LegalPage({ kind }) {
  const meta = LEGAL_PAGES[kind]
  const [legal, setLegal] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    loadLegal()
      .then((data) => alive && setLegal(data))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [kind])

  const page = legal?.pages?.[kind]
  const company = legal?.company || {}
  const updated = formatLegalDate(page?.updated_at)
  const others = Object.entries(LEGAL_PAGES).filter(([k]) => k !== kind)

  return (
    <main className={styles.page}>
      <title>{`${meta.title} | ${BRAND.name}`}</title>
      <div className={styles.container}>
        <Link to="/" className={styles.back}>
          <FiArrowLeft aria-hidden="true" /> Voltar para a loja
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>{meta.title}</h1>
          {updated && <p className={styles.updated}>Atualizado em {updated}</p>}
        </header>

        {!legal && !failed && (
          <div className={styles.loading} aria-busy="true" aria-live="polite">
            <span className="pz-visually-hidden">Carregando o texto</span>
            <span /><span /><span /><span />
          </div>
        )}

        {failed && (
          <p className={styles.notice} role="alert">
            Não deu para carregar este texto agora. Tente de novo em instantes
            {company.email ? <> ou escreva para <a href={`mailto:${company.email}`}>{company.email}</a></> : null}.
          </p>
        )}

        {page && (page.content ? <Markdown source={page.content} /> : (
          <p className={styles.notice}>Este texto ainda está sendo preparado pela loja.</p>
        ))}

        {legal && (
          <aside className={styles.contact} aria-label="Fale com a loja">
            {kind === 'privacy' ? (
              <>
                <h2 className={styles.contactTitle}><FiShield aria-hidden="true" /> Seus dados, seus direitos</h2>
                <p>
                  Você pode pedir uma cópia, a correção ou a exclusão dos seus dados, ou parar de receber e-mails, em{' '}
                  <Link to="/meus-dados">Meus dados</Link>.
                </p>
                {(company.dpo_name || company.dpo_email) && (
                  <p>
                    Encarregado de dados{company.dpo_name ? `: ${company.dpo_name}` : ''}
                    {company.dpo_email && <> · <a href={`mailto:${company.dpo_email}`}>{company.dpo_email}</a></>}
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className={styles.contactTitle}><FiMail aria-hidden="true" /> Ficou com alguma dúvida?</h2>
                <p>
                  {company.email ? <>Escreva para <a href={`mailto:${company.email}`}>{company.email}</a></> : 'Fale com a gente pelo chat da loja'}
                  {company.phone ? <> ou ligue para <a href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}>{company.phone}</a></> : null}
                  {company.hours ? <>, {company.hours}</> : null}.
                </p>
              </>
            )}
          </aside>
        )}

        <nav className={styles.more} aria-label="Outros textos">
          {others.map(([k, p]) => (
            <Link key={k} to={p.path} className={styles.moreLink}>{p.title}</Link>
          ))}
          <Link to="/meus-dados" className={styles.moreLink}>Meus dados</Link>
        </nav>
      </div>
    </main>
  )
}
