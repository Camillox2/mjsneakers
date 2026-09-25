import { useEffect, useRef, useState } from 'react'
import { FrameClock, Settle, SpinCanvas, acquireSequence, curveIndex, frameDelta, idleFps, loadManifest, netProfile, pickSize, turnsAt } from '../../lib/frames'
import { prefersReducedMotion } from '../../lib/motion'
import styles from './SpinViewer.module.css'

const MAX_SPIN = 1.2 // voltas por segundo no embalo depois de soltar

// Tênis 360°. Parado, gira sozinho como vitrine, quadro a quadro em cadência
// fixa (quadro inteiro: nada de fantasma); só começa quando metade dos
// quadros chegou, para não girar aos trancos enquanto carrega.
// `interactive`: o dedo (ou o mouse) gira o par; ao soltar, ele continua no
// embalo e freia sozinho. Desligado (órbita), é só vitrine, sem arrastar.
// `delay`: espera antes de começar a baixar/desenhar (ex.: enquanto um modal
// termina de abrir, para a entrada não disputar com o carregamento).
// Rede fraca (economia de dados, 2g): fica o pôster; o giro só baixa se a
// pessoa tocar nele. Na vitrine sem toque (órbita), fica só o pôster.
export default function SpinViewer({ id, alt = '', className = '', delay = 0, hint = true, interactive = true }) {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [touched, setTouched] = useState(false)
  const [lean] = useState(() => netProfile().lean)

  useEffect(() => {
    let alive = true
    let seq = null
    let release = null
    let painter = null
    let clock = null
    let raf = 0
    let pos = 0 // giro sozinho: quadro inteiro
    let angle = 0 // arrastando: em voltas
    let velocity = 0 // embalo ao soltar, em voltas por segundo
    let dragging = false
    let startX = 0
    let lastX = 0
    let lastT = 0
    let lastNow = 0
    let lastIndex = null
    const settle = new Settle()
    let interacted = false
    const auto = !prefersReducedMotion()
    const canvas = canvasRef.current

    let onScreen = true
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
    })
    io.observe(canvas)

    const loop = (now) => {
      if (!alive) return
      raf = requestAnimationFrame(loop)
      const dtMs = lastNow ? Math.min(100, now - lastNow) : 16.7
      lastNow = now
      // fora da tela: só espera, sem desenhar
      if (!onScreen || document.hidden || !seq || !painter) return
      const n = seq.count
      if (!interacted) {
        // gira sozinho só com metade dos quadros prontos (antes, parado e nítido)
        if (auto && seq.settled >= n / 2) pos += clock.tick(dtMs)
        else clock.reset()
        painter.draw(seq.exact(pos, 1))
        angle = turnsAt(seq.curve, n, pos)
        lastIndex = ((pos % n) + n) % n
        return
      }
      if (!dragging && Math.abs(velocity) > 0.002) {
        angle += velocity * (dtMs / 1000)
        velocity *= Math.pow(0.94, dtMs / 16.7)
      }
      const index = curveIndex(seq.curve, n, angle)
      const speed = lastIndex === null ? 0 : frameDelta(lastIndex, index, n)
      lastIndex = index
      const v = seq.view(index, speed)
      painter.blend(v.a, v.b, settle.weight(v.pair, v.t, speed, dtMs))
    }

    // Só vira arrasto depois de alguns px na horizontal: um dedo que só quer
    // rolar a página por cima do tênis não para o giro sozinho.
    const down = (e) => {
      dragging = true
      startX = e.clientX
      velocity = 0
      lastX = e.clientX
      lastT = performance.now()
      if (!seq) boot() // rede fraca: o primeiro toque é que baixa o giro
    }
    const move = (e) => {
      if (!dragging) return
      if (!interacted) {
        if (Math.abs(e.clientX - startX) < 6) return
        interacted = true
        lastX = e.clientX
        canvas.setPointerCapture?.(e.pointerId)
        setTouched(true)
      }
      const now = performance.now()
      const dx = e.clientX - lastX
      const turns = -dx / Math.max(canvas.clientWidth, 1) * 0.9
      angle += turns
      // embalo com teto: um puxão rápido virava um giro tão veloz que a
      // decodificação não acompanhava (travava e voltava)
      velocity = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, turns / Math.max((now - lastT) / 1000, 1 / 60)))
      lastX = e.clientX
      lastT = now
    }
    const up = () => {
      dragging = false
    }
    const keys = (e) => {
      if (e.key === 'ArrowLeft') angle += 1 / 24
      else if (e.key === 'ArrowRight') angle -= 1 / 24
      else return
      if (!seq) boot()
      interacted = true
      setTouched(true)
      e.preventDefault()
    }

    if (interactive) {
      canvas.addEventListener('pointerdown', down)
      canvas.addEventListener('pointermove', move)
      canvas.addEventListener('pointerup', up)
      canvas.addEventListener('pointercancel', up)
      canvas.addEventListener('keydown', keys)
    }

    let booting = false
    const boot = () => {
      if (booting) return undefined
      booting = true
      return loadManifest(id)
      .then((m) => {
        if (!alive) return
        // o mesmo giro em outro lugar da página já baixou os quadros: aproveita
        ;({ seq, release } = acquireSequence(id, m, pickSize()))
        painter = new SpinCanvas(canvas)
        clock = new FrameClock(idleFps(seq.count))
        if (seq.settled >= seq.firstPass) setLoaded(true)
        else {
          const off = seq.onProgress((s) => {
            if (s.settled >= s.firstPass) {
              off()
              if (alive) setLoaded(true)
            }
          })
        }
        seq.start(lean ? 2 : 4)
        raf = requestAnimationFrame(loop)
      })
      .catch(() => {
        booting = false
      })
    }
    // só baixa quando estiver chegando perto da tela (não disputa com a
    // abertura); em rede fraca, só quando a pessoa toca
    let bootTimer = 0
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        near.disconnect()
        bootTimer = setTimeout(boot, delay)
      },
      { rootMargin: '300px 0px' },
    )
    if (!lean) near.observe(canvas)

    const ro = new ResizeObserver(() => painter?.resize())
    ro.observe(canvas)

    return () => {
      alive = false
      clearTimeout(bootTimer)
      near.disconnect()
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      release?.()
      if (interactive) {
        canvas.removeEventListener('pointerdown', down)
        canvas.removeEventListener('pointermove', move)
        canvas.removeEventListener('pointerup', up)
        canvas.removeEventListener('pointercancel', up)
        canvas.removeEventListener('keydown', keys)
      }
    }
  }, [id, delay, interactive, lean])

  return (
    <div className={`${styles.viewer} ${interactive ? '' : styles.still} ${className}`}>
      <img className={`${styles.poster} ${loaded ? styles.hidden : ''}`} src={`/giros/${id}/poster.webp`} alt={alt} draggable={false} />
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${loaded ? '' : styles.waiting}`}
        tabIndex={interactive ? 0 : undefined}
        role="img"
        aria-label={interactive ? `${alt}. Arraste ou use as setas para girar o tênis.` : alt}
      />
      <span className={styles.floor} aria-hidden="true" />
      {interactive && (
        <span className={`${styles.hint} ${touched || !hint ? styles.hintGone : ''}`} aria-hidden="true">
          <svg viewBox="0 0 40 24">
            <ellipse cx="20" cy="13" rx="16" ry="5" />
            <path d="M31 8l4 4.5-5 1.8" />
            <path d="M9 18l-4-4.5 5-1.8" />
          </svg>
          {lean && !loaded ? 'Toque para girar' : 'Arraste para girar'}
        </span>
      )}
    </div>
  )
}
