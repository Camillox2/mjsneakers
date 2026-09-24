import { useLayoutEffect, useRef } from 'react'
import { gsap, prefersReducedMotion } from '../../lib/motion'
import { getImageUrl } from '../../utils/imageHelper'
import SpinViewer from '../../components/SpinViewer/SpinViewer'
import styles from './BrandOrbit.module.css'

const TAU = Math.PI * 2
const FRONT = Math.PI / 2 // ponto da elipse mais perto de quem vê (embaixo)
const LAP = 48000 // ms para cada nome dar uma volta inteira
const SAMPLES = 96 // pontos da elipse em cada animação

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Um nome no ângulo th da elipse: onde fica, tamanho, brilho e se está na
// metade da frente (na frente do tênis) ou de trás (atrás dele).
function pose(th, w, h) {
  const narrow = w < 700
  const depth = Math.sin(th) // 1 = frente
  const near = (depth + 1) / 2
  return {
    x: w / 2 + w * (narrow ? 0.44 : 0.41) * Math.cos(th),
    y: h * 0.5 + h * (narrow ? 0.34 : 0.33) * depth,
    scale: 0.55 + 0.45 * near,
    alpha: 0.16 + 0.84 * near * near,
    fore: smooth(-0.12, 0.12, depth), // troca de camada nas laterais, sem pulo
    chrome: smooth(0.8, 0.97, near), // só a marca bem na frente acende em cromo
  }
}

// Órbita de marcas: os nomes andam numa elipse em volta do tênis da marca
// escolhida. A da frente é grande e acende em cromo; as de trás ficam menores,
// apagadas e atrás do tênis. Clicar traz a marca para a frente e filtra a vitrine.
//
// Quem move os nomes é a placa de vídeo (Web Animations só de transform e
// opacidade): a órbita não engasga quando a página está ocupada e o texto não
// é redesenhado no caminho. Cada nome existe duas vezes, uma atrás do tênis e
// outra na frente, que trocam de opacidade nas laterais (z-index não anima).
// O cromo entra aos poucos: trocar de classe fazia a próxima marca piscar.
export default function BrandOrbit({ brands, active, onPick, shoeFor, onSeeAll, countFor }) {
  const stageRef = useRef(null)
  const foreRefs = useRef([])
  const backRefs = useRef([])
  const anims = useRef([]) // por marca: as animações que andam juntas
  const hold = useRef({ timer: 0, tween: null, visible: true })
  const n = brands.length
  const names = brands.map((b) => b.name).join('|')

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || !n || !stage.animate) return undefined
    const still = prefersReducedMotion()
    const h0 = hold.current

    const build = () => {
      const w = stage.clientWidth
      const h = stage.clientHeight
      if (!w || !h) return
      // mantém a posição de cada nome ao refazer (tela mudou de tamanho)
      const at = anims.current.map((list) => list[0]?.currentTime)
      anims.current.forEach((list) => list.forEach((a) => a.cancel()))
      const fore = []
      const back = []
      const base = []
      const chrome = []
      for (let s = 0; s <= SAMPLES; s += 1) {
        const p = pose(FRONT + (s / SAMPLES) * TAU, w, h)
        const transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${p.scale.toFixed(3)})`
        fore.push({ transform, opacity: +(p.alpha * p.fore).toFixed(3) })
        back.push({ transform, opacity: +(p.alpha * (1 - p.fore)).toFixed(3) })
        base.push({ opacity: +(1 - p.chrome).toFixed(3) })
        chrome.push({ opacity: +p.chrome.toFixed(3) })
      }
      const timing = { duration: LAP, iterations: Infinity, easing: 'linear' }
      anims.current = brands.map((_, k) => {
        const fEl = foreRefs.current[k]
        const bEl = backRefs.current[k]
        if (!fEl || !bEl) return []
        const list = [
          fEl.animate(fore, timing),
          bEl.animate(back, timing),
          fEl.querySelector('[data-base]').animate(base, timing),
          fEl.querySelector('[data-chrome]').animate(chrome, timing),
        ]
        // marca k começa k/n de volta adiante da primeira
        const t = at[k] ?? (k / n) * LAP
        list.forEach((a) => {
          a.currentTime = t
          if (still || !h0.visible || h0.timer || h0.tween) a.pause()
        })
        return list
      })
    }

    build()
    const ro = new ResizeObserver(build)
    ro.observe(stage)
    // fora da tela a órbita para (não gasta nada)
    const io = new IntersectionObserver(([e]) => {
      h0.visible = e.isIntersecting
      if (still || h0.timer || h0.tween) return
      anims.current.forEach((list) => list.forEach((a) => (h0.visible ? a.play() : a.pause())))
    })
    io.observe(stage)
    return () => {
      ro.disconnect()
      io.disconnect()
      clearTimeout(h0.timer)
      h0.timer = 0
      h0.tween?.kill()
      h0.tween = null
      anims.current.forEach((list) => list.forEach((a) => a.cancel()))
      anims.current = []
    }
  }, [n, names]) // eslint-disable-line react-hooks/exhaustive-deps

  // traz a marca k para a frente pelo caminho mais curto e segura um tempo
  const bringFront = (k) => {
    const list = anims.current[k]
    if (!list?.length) return
    const h0 = hold.current
    const all = anims.current.flat()
    const phase = ((list[0].currentTime % LAP) + LAP) % LAP // 0 = na frente
    const delta = phase > LAP / 2 ? LAP - phase : -phase
    const from = all.map((a) => a.currentTime)
    all.forEach((a) => a.pause())
    h0.tween?.kill()
    clearTimeout(h0.timer)
    const resume = () => {
      h0.timer = setTimeout(() => {
        h0.timer = 0
        if (h0.visible && !prefersReducedMotion()) all.forEach((a) => a.play())
      }, 4500)
    }
    if (prefersReducedMotion()) {
      all.forEach((a, i) => (a.currentTime = from[i] + delta + LAP))
      return
    }
    const shift = { v: 0 }
    h0.tween = gsap.to(shift, {
      v: delta,
      duration: 0.9,
      ease: 'power3.inOut',
      onUpdate: () => all.forEach((a, i) => (a.currentTime = from[i] + shift.v + LAP)),
      onComplete: () => {
        h0.tween = null
        resume()
      },
    })
  }

  const shoe = shoeFor(active?.name)
  const count = active ? countFor(active.name) : 0

  return (
    <div className={styles.wrap}>
      <div ref={stageRef} className={styles.stage}>
        <svg className={styles.ring} viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="500" cy="300" rx="410" ry="198" />
          <ellipse cx="500" cy="300" rx="470" ry="236" className={styles.ringDash} />
        </svg>

        <div className={styles.center} style={{ '--glow': shoe?.glow || '#cdd1d8' }}>
          {shoe ? (
            <div key={shoe.id} className={styles.shoe}>
              {shoe.spin ? (
                <SpinViewer id={shoe.spin} alt={shoe.name} hint={false} />
              ) : (
                <img src={getImageUrl(shoe.image_url, shoe.name)} alt={shoe.name} className={shoe.fit === 'contain' ? styles.contain : styles.cover} />
              )}
            </div>
          ) : (
            <p key={active?.name || 'vazio'} className={styles.soon}>
              {active ? `${active.name} chega com o catálogo de verdade` : ''}
            </p>
          )}
        </div>

        <nav aria-label="Escolher marca">
          {/* a mesma marca atrás do tênis (só aparece na metade de trás) */}
          {brands.map((b, k) => (
            <span key={`${b.name}-atras`} ref={(el) => (backRefs.current[k] = el)} className={`${styles.brand} ${styles.back}`} aria-hidden="true">
              {b.name}
            </span>
          ))}
          {brands.map((b, k) => (
            <button
              key={b.name}
              ref={(el) => (foreRefs.current[k] = el)}
              type="button"
              className={`${styles.brand} ${styles.fore} ${active?.name === b.name ? styles.on : ''}`}
              aria-pressed={active?.name === b.name}
              onClick={() => {
                bringFront(k)
                onPick(active?.name === b.name ? null : b)
              }}
              onFocus={() => bringFront(k)}
            >
              <span className={styles.base} data-base>
                {b.name}
              </span>
              <span className={styles.chrome} data-chrome aria-hidden="true">
                {b.name}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div className={styles.foot} aria-live="polite">
        {active ? (
          count > 0 ? (
            <button type="button" className="pz-btn" onClick={onSeeAll}>
              Ver {count === 1 ? 'o par' : `os ${count} pares`} da {active.name}
            </button>
          ) : (
            <p className={styles.hint}>Ainda não tem par da {active.name} na vitrine. Escolha outra marca na órbita.</p>
          )
        ) : (
          <p className={styles.hint}>Toque numa marca da órbita para ver os pares dela.</p>
        )}
      </div>
    </div>
  )
}
