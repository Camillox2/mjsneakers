// Céu estrelado da abertura do giro. Parado, as estrelas piscam de leve atrás
// do tênis e do logo; conforme a rolagem avança (p de 0 a 1), o céu desce cada
// vez mais rápido e cada estrela ganha um rastro para cima, virando cometa,
// até o mundo do primeiro tênis cobrir tudo.
//
// Desenho barato: o brilho da estrela e o rastro são duas imagens prontas,
// desenhadas com drawImage. Nenhum degradê é criado a cada quadro.

// gerador com semente fixa: o céu é sempre o mesmo
function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sprite(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  return c
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export class StarField {
  constructor(canvas, count) {
    this.canvas = canvas
    // opaco: o palco já é preto, e canvas opaco custa menos para compor
    this.ctx = canvas.getContext('2d', { alpha: false })
    const rand = seeded(20260924)
    this.stars = Array.from({ length: count }, () => ({
      x: rand(),
      y: rand(),
      z: 0.12 + 0.88 * rand() ** 2.2, // profundidade: a maioria longe (pequena e lenta)
      tw: 0.5 + rand() * 1.7, // ritmo do pisca
      ph: rand() * Math.PI * 2,
    }))
    this.glow = sprite(32, 32, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
      grad.addColorStop(0.16, 'rgba(250, 252, 255, 0.95)')
      grad.addColorStop(0.4, 'rgba(205, 222, 255, 0.22)')
      grad.addColorStop(1, 'rgba(205, 222, 255, 0)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    })
    // rastro do cometa: some para cima, forte perto da cabeça
    this.tail = sprite(8, 160, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(190, 212, 255, 0)')
      grad.addColorStop(0.65, 'rgba(214, 228, 255, 0.28)')
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.95)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    })
    this.resize()
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  // time: segundos (pisca); p: 0 a 1 (quanto já rolou da abertura);
  // alpha: 0 a 1 (entrada do céu enquanto a página carrega)
  draw(time, p, alpha) {
    const { width: W, height: H } = this.canvas
    const ctx = this.ctx
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    if (alpha <= 0.001) return
    const fall = p ** 1.6 // desce devagar e vai acelerando
    const streak = smooth(0.06, 1, p) // o rastro cresce com a descida
    const calm = 1 - smooth(0, 0.3, p) // estrela parada pisca; cometa não
    const unit = Math.min(W, H) / 900 // W e H já estão em pixels da tela
    for (const s of this.stars) {
      const x = s.x * W
      const y = ((s.y + fall * (0.2 + 1.7 * s.z)) % 1) * H
      const d = (2.6 + 6 * s.z) * unit * (1 + 0.5 * streak * s.z)
      const flicker = 1 - calm * 0.4 * (0.5 + 0.5 * Math.sin(time * s.tw + s.ph))
      const a = alpha * (0.3 + 0.7 * s.z) * flicker
      const len = streak * (0.02 + 0.34 * s.z) * H
      if (len > 1) {
        const tw = Math.max(1, d * 0.34)
        ctx.globalAlpha = a
        ctx.drawImage(this.tail, x - tw / 2, y - len, tw, len)
      }
      ctx.globalAlpha = a
      ctx.drawImage(this.glow, x - d, y - d, d * 2, d * 2)
    }
    ctx.globalAlpha = 1
  }
}
