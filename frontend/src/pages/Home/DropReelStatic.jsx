import { useEffect } from 'react'
import { DROPS } from '../../data/drops'
import ChromeLogo from '../../components/ChromeLogo/ChromeLogo'
import styles from './DropReelStatic.module.css'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

// Mesmo conteúdo do giro, sem prender a rolagem nem animar: para quem pediu
// menos movimento no aparelho ou quando os quadros não carregam.
export default function DropReelStatic({ onPick }) {
  // sem o palco animado, o header fica sempre em vidro escuro (legível em qualquer cor)
  useEffect(() => {
    const header = document.querySelector('[data-pz-header]')
    header?.classList.add('pz-solid')
    return () => header?.classList.remove('pz-solid')
  }, [])

  return (
    <section className={styles.wrap} aria-label="Os drops">
      <div className={styles.opening}>
        <ChromeLogo shine={false} className={styles.logo} />
      </div>
      {DROPS.map((d) => (
        <article
          key={d.id}
          className={styles.drop}
          style={{ background: d.world.bg, color: d.world.ink, '--ink2': d.world.ink2 }}
        >
          <img className={styles.shoe} src={`/giros/${d.id}/poster.webp`} alt={d.name} loading="lazy" />
          <div className={styles.info}>
            <h2 className={styles.name}>{d.name}</h2>
            <p className={styles.line}>{d.line}</p>
            <dl className={styles.specs}>
              {d.specs.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.buy}>
              <span className={styles.price}>{brl(d.price)}</span>
              <button type="button" className="pz-btn" onClick={() => onPick?.(d)}>
                Quero esse
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  )
}
