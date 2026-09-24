import { useEffect, useRef, useState } from 'react'
import { FrameClock, FrameSequence, Settle, SpinCanvas, curveIndex, frameDelta, idleFps, loadManifest, pickSize, turnsAt } from '../../lib/frames'
import { prefersReducedMotion } from '../../lib/motion'
import styles from './SpinViewer.module.css'

const MAX_SPIN = 1.2 // voltas por segundo no embalo depois de soltar

// Tênis 360° de arrastar: o dedo (ou o mouse) gira o par; ao soltar, ele
// continua no embalo e freia sozinho. Parado, gira sozinho como vitrine,
// quadro a quadro em cadência fixa (quadro inteiro: nada de fantasma).
// `delay`: espera antes de começar a baixar/desenhar (ex.: enquanto um modal
// termina de abrir, para a entrada não disputar com o carregamento).
export default function SpinViewer({ id, alt = '', className = '', delay = 0, hint = true }) {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    let alive = true
    let seq = null
    let painter = null
    let clock = null
    let raf = 0
    let pos = 0 // giro sozinho: quadro inteiro
    let angle = 0 // arrastando: em voltas
    let velocity = 0 // embalo ao soltar, em voltas por segundo
    let dragging = false
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
      if (auto && !interacted) {
        pos += clock.tick(dtMs)
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

    const down = (e) => {
      dragging = true
      interacted = true
      velocity = 0
      lastX = e.clientX
      lastT = performance.now()
      canvas.setPointerCapture?.(e.pointerId)
      setTouched(true)
    }
    const move = (e) => {
      if (!dragging) return
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
      interacted = true
      setTouched(true)
      e.preventDefault()
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('keydown', keys)

    const boot = () => loadManifest(id)
      .then((m) => {
        if (!alive) return
        seq = new FrameSequence(id, m, pickSize())
        painter = new SpinCanvas(canvas)
        clock = new FrameClock(idleFps(seq.count))
        const off = seq.onProgress((s) => {
          if (s.settled >= s.firstPass) {
            off()
            setLoaded(true)
          }
        })
        seq.start(4)
        raf = requestAnimationFrame(loop)
      })
      .catch(() => {})
    // só baixa quando estiver chegando perto da tela (não disputa com a abertura)
    let bootTimer = 0
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        near.disconnect()
        bootTimer = setTimeout(boot, delay)
      },
      { rootMargin: '300px 0px' },
    )
    near.observe(canvas)

    const ro = new ResizeObserver(() => painter?.resize())
    ro.observe(canvas)

    return () => {
      alive = false
      clearTimeout(bootTimer)
      near.disconnect()
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      seq?.dispose()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('keydown', keys)
    }
  }, [id, delay])

  return (
    <div className={`${styles.viewer} ${className}`}>
      <img className={`${styles.poster} ${loaded ? styles.hidden : ''}`} src={`/giros/${id}/poster.webp`} alt={alt} draggable={false} />
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${loaded ? '' : styles.hidden}`}
        tabIndex={0}
        role="img"
        aria-label={`${alt}. Arraste ou use as setas para girar o tênis.`}
      />
      <span className={styles.floor} aria-hidden="true" />
      <span className={`${styles.hint} ${touched || !hint ? styles.hintGone : ''}`} aria-hidden="true">
        <svg viewBox="0 0 40 24">
          <ellipse cx="20" cy="13" rx="16" ry="5" />
          <path d="M31 8l4 4.5-5 1.8" />
          <path d="M9 18l-4-4.5 5-1.8" />
        </svg>
        Arraste para girar
      </span>
    </div>
  )
}
