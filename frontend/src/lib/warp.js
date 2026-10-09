// Salto no hiperespaço: estrelas saem de um ponto de fuga no centro e voam
// para fora da tela, em perspectiva, com um rastro curto que cresce conforme
// chegam perto. Um <canvas> só, desenhado com linhas (nada de degradê por
// quadro). Para quando sai da tela ou a aba fica escondida; com
// prefers-reduced-motion, fica um céu parado de pontinhos.

const TINTS = ['255,255,255', '226,236,255', '200,218,255', '186,206,255']

export function startWarp(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return () => {}
  let w = 0
  let h = 0
  let dpr = 1
  let stars = []
  let raf = 0
  let last = 0
  let onScreen = false
  let alive = true

  const spawn = (s, fresh) => {
    // posição no "plano" da tela, longe do centro exato (senão fica parada)
    const a = Math.random() * Math.PI * 2
    const r = 0.04 + Math.random() * 0.96
    s.x = Math.cos(a) * r
    s.y = Math.sin(a) * r
    s.z = fresh ? 0.08 + Math.random() * 0.92 : 0.9 + Math.random() * 0.1
    s.pz = s.z
    s.v = 0.22 + Math.random() * 0.3 // profundidade por segundo
    s.tint = TINTS[(Math.random() * TINTS.length) | 0]
    return s
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = Math.max(1, Math.round(rect.width * dpr))
    h = Math.max(1, Math.round(rect.height * dpr))
    canvas.width = w
    canvas.height = h
    // quantidade pela área (em px CSS): faixa pequena do celular leva menos
    const area = rect.width * rect.height
    const count = Math.round(Math.min(260, Math.max(90, area / 1600)))
    while (stars.length < count) stars.push(spawn({}, true))
    stars.length = count
    if (reduced || !onScreen) drawStatic()
  }

  const project = (s, z) => {
    const f = Math.max(w, h) * 0.5
    return [w / 2 + (s.x / z) * f * 0.5, h / 2 + (s.y / z) * f * 0.5]
  }

  function drawStatic() {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    for (const s of stars) {
      const [x, y] = project(s, Math.max(s.z, 0.3))
      if (x < 0 || y < 0 || x > w || y > h) continue
      const near = 1 - s.z
      ctx.fillStyle = `rgba(${s.tint},${(0.25 + near * 0.6).toFixed(3)})`
      const r = (0.5 + near * 1.1) * dpr
      ctx.fillRect(x - r / 2, y - r / 2, r, r)
    }
  }

  const frame = (now) => {
    raf = 0
    if (!alive || !onScreen || document.hidden) return
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.lineCap = 'round'
    for (const s of stars) {
      s.pz = s.z
      s.z -= s.v * dt
      if (s.z <= 0.02) { spawn(s, false); continue }
      const [x, y] = project(s, s.z)
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) { spawn(s, false); continue }
      // rastro: de onde estava um instante atrás (mais longe) até agora;
      // perto da tela o salto por quadro é maior, então o rastro cresce sozinho
      const [tx, ty] = project(s, Math.min(1, s.z + s.v * 0.06))
      const near = 1 - s.z
      const alpha = Math.min(1, 0.08 + near * near * 1.1)
      ctx.strokeStyle = `rgba(${s.tint},${alpha.toFixed(3)})`
      ctx.lineWidth = (0.6 + near * near * 2.2) * dpr
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    raf = requestAnimationFrame(frame)
  }

  const play = () => {
    if (reduced || raf || !onScreen || document.hidden || !alive) return
    last = 0
    raf = requestAnimationFrame(frame)
  }
  const pause = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    if (onScreen) play()
    else pause()
  })
  io.observe(canvas)
  const onVis = () => (document.hidden ? pause() : play())
  document.addEventListener('visibilitychange', onVis)
  resize()

  return () => {
    alive = false
    pause()
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVis)
  }
}
