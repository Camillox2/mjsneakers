import { useLayoutEffect, useRef } from 'react'
import { gsap, prefersReducedMotion } from '../../lib/motion'
import styles from './TrustStrip.module.css'

// Ícones de traço feitos para esta faixa; cada um se desenha ao entrar na tela.
const ITEMS = [
  {
    big: 'R$ 299',
    title: 'Frete grátis',
    sub: 'Acima desse valor, o envio é por nossa conta.',
    icon: (
      <>
        <path d="M5 30h24V14H5z" />
        <path d="M29 20h8l5 6v4h-13z" />
        <g data-spin>
          <circle cx="13" cy="33" r="3.5" />
          <path d="M13 30.5v5M10.5 33h5" />
        </g>
        <g data-spin>
          <circle cx="35" cy="33" r="3.5" />
          <path d="M35 30.5v5M32.5 33h5" />
        </g>
        <path d="M1 18h7M2 23h5" data-speed />
      </>
    ),
  },
  {
    big: '100%',
    title: 'Original',
    sub: 'Todo par sai com garantia total de autenticidade.',
    icon: (
      <>
        <path d="M24 5l15 5v11c0 10-6.5 17-15 21-8.5-4-15-11-15-21V10z" />
        <path d="M17 23l5 5 9-10" data-check />
      </>
    ),
  },
  {
    big: '30 dias',
    title: 'Troca fácil',
    sub: 'Não serviu? Você troca sem complicação.',
    icon: (
      <>
        <path d="M38 17a15 15 0 0 0-27-3" />
        <path d="M11 7v7h7" />
        <path d="M10 31a15 15 0 0 0 27 3" />
        <path d="M37 41v-7h-7" />
      </>
    ),
  },
  {
    big: '24h',
    title: 'Envio rápido',
    sub: 'O pedido sai em até um dia útil.',
    icon: (
      <>
        <circle cx="24" cy="25" r="16" />
        <path d="M24 25V15" data-hand />
        <path d="M24 25l6 4" data-hand />
        <path d="M20 4h8" />
      </>
    ),
  },
]

export default function TrustStrip() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined
    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray('svg path, svg circle')
      gsap.set(paths, { drawSVG: '0%' })
      gsap.to(paths, {
        drawSVG: '100%',
        duration: 1.1,
        ease: 'power2.inOut',
        stagger: 0.06,
        scrollTrigger: { trigger: ref.current, start: 'top 82%', once: true },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={ref} className={styles.strip} aria-labelledby="garantias">
      <h2 id="garantias" className="pz-visually-hidden">
        Garantias da loja
      </h2>
      <div className={styles.grid}>
        {ITEMS.map((item) => (
          <div key={item.title} className={styles.item}>
            <div className={styles.top}>
              <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
                {item.icon}
              </svg>
              <p className={styles.title}>{item.title}</p>
            </div>
            <p className={styles.big}>{item.big}</p>
            <p className={styles.sub}>{item.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
