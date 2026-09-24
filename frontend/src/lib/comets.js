// Cometas de comemoração: o par indo para a sacola, a inscrição na
// newsletter e o pedido confirmado. É a mesma luz do céu da abertura.
// Uma camada de canvas por cima da página, criada na hora e removida quando
// a animação acaba: parado, não custa nada. Quem pediu menos movimento não
// recebe (a sacola ainda dá o pulinho de sempre).
import { prefersReducedMotion } from './motion'

let layer = null
let flying = 0
let sprites = null

// um cometa a caminho da sacola: o pulinho dela espera ele chegar
export const cometFlying = () => flying > 0

function makeSprites() {
  const glow = document.createElement('canvas')
  glow.width = glow.height = 64
  const g = glow.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.14, 'rgba(250, 252, 255, 0.95)')
  grad.addColorStop(0.38, 'rgba(200, 220, 255, 0.28)')
  grad.addColorStop(1, 'rgba(200, 220, 255, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  // rastro: some para trás, forte perto da cabeça (desenhado na vertical)
  const tail = document.createElement('canvas')
  tail.width = 8
  tail.height = 160
  const t = tail.getContext('2d')
  const tg = t.createLinearGradient(0, 0, 0, 160)
  tg.addColorStop(0, 'rgba(190, 212, 255, 0)')
  tg.addColorStop(0.6, 'rgba(214, 228, 255, 0.3)')
  tg.addColorStop(1, 'rgba(255, 255, 255, 0.95)')
  t.fillStyle = tg
  t.fillRect(0, 0, 8, 160)
  return { glow, tail }
}

function ensureLayer() {
  if (layer) return layer
  sprites ??= makeSprites()
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '6000', pointerEvents: 'none' })
  document.body.appendChild(canvas)
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  layer = { canvas, ctx, items: [], raf: 0 }
  layer.raf = requestAnimationFrame(tick)
  return layer
}

function tick(now) {
  const { ctx, canvas, items } = layer
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  layer.items = items.filter((item) => item.draw(ctx, now))
  if (layer.items.length) {
    layer.raf = requestAnimationFrame(tick)
  } else {
    canvas.remove()
    layer = null
  }
}

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

function dot(ctx, x, y, radius, alpha) {
  ctx.globalAlpha = alpha
  ctx.drawImage(sprites.glow, x - radius, y - radius, radius * 2, radius * 2)
}

// Rastro reto: cabeça em (x, y), cauda para trás na direção (dx, dy).
function streak(ctx, x, y, dx, dy, len, width, alpha) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2)
  ctx.globalAlpha = alpha
  ctx.drawImage(sprites.tail, -width / 2, -len, width, len)
  ctx.restore()
}

// 1) Sacola: o cometa sai de onde a pessoa clicou, faz um arco até a sacola
// do topo e estoura num anel com faíscas. Na chegada avisa o header
// ('pz:cart-hit'), que dá o pulinho da sacola nessa hora.
export function cometToCart(from) {
  if (prefersReducedMotion()) return false
  const target = document.querySelector('[data-pz-cart]')
  const box = target?.getBoundingClientRect()
  if (!from || !box || !box.width) return false
  const to = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  const lift = Math.min(260, Math.hypot(to.x - from.x, to.y - from.y) * 0.45)
  const ctrl = { x: (from.x + to.x) / 2 - lift * 0.35, y: Math.min(from.y, to.y) - lift }
  const start = performance.now()
  const dur = 760
  const trail = []
  let arrived = false
  flying += 1
  const sparks = Array.from({ length: 9 }, (_, k) => ({ a: (k / 9) * Math.PI * 2 + Math.random() * 0.4, v: 60 + Math.random() * 70 }))
  const { items } = ensureLayer()
  items.push({
    draw(ctx, now) {
      const p = Math.min(1, (now - start) / dur)
      if (p < 1) {
        const t = easeInOut(p)
        const u = 1 - t
        const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x
        const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y
        trail.unshift({ x, y })
        if (trail.length > 26) trail.pop()
        trail.forEach((pt, k) => dot(ctx, pt.x, pt.y, 9 * (1 - k / 26) + 2, 0.55 * (1 - k / 26)))
        dot(ctx, x, y, 16, 1)
        ctx.globalAlpha = 1
        return true
      }
      if (!arrived) {
        arrived = true
        flying -= 1
        window.dispatchEvent(new Event('pz:cart-hit'))
      }
      // estouro na sacola
      const q = (now - start - dur) / 480
      if (q >= 1) return false
      ctx.globalAlpha = 1 - q
      ctx.strokeStyle = 'rgba(235, 242, 255, 0.9)'
      ctx.lineWidth = 2 * (1 - q) + 0.5
      ctx.beginPath()
      ctx.arc(to.x, to.y, 10 + 30 * q, 0, Math.PI * 2)
      ctx.stroke()
      sparks.forEach((s) => {
        const r = s.v * q
        dot(ctx, to.x + Math.cos(s.a) * r, to.y + Math.sin(s.a) * r, 5 * (1 - q) + 1, 1 - q)
      })
      dot(ctx, to.x, to.y, 22 * (1 - q), 1 - q)
      ctx.globalAlpha = 1
      return true
    },
  })
  return true
}

// 2 e 3) Chuva de cometas dentro de um retângulo da tela (a seção da
// newsletter) ou na tela inteira (pedido confirmado): todos na mesma
// direção, como uma chuva de meteoros, entrando e saindo aos poucos.
export function cometShower(rect, { count = 18, duration = 1500 } = {}) {
  if (prefersReducedMotion()) return
  const zone = rect ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  const angle = (112 + Math.random() * 10) * (Math.PI / 180) // desce inclinado para a esquerda
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const start = performance.now()
  const comets = Array.from({ length: count }, () => {
    const near = Math.random()
    return {
      delay: Math.random() * duration * 0.55,
      life: duration * (0.35 + 0.3 * Math.random()),
      x: zone.left + zone.width * (0.15 + Math.random() * 1.0),
      y: zone.top - zone.height * 0.05 + Math.random() * zone.height * 0.45,
      speed: (0.5 + near * 0.9) * Math.max(zone.height, 320) * 1.6, // px por segundo
      len: 50 + near * 170,
      size: 3 + near * 5,
    }
  })
  const { items } = ensureLayer()
  items.push({
    draw(ctx, now) {
      const elapsed = now - start
      if (elapsed > duration * 1.25) return false
      ctx.save()
      ctx.beginPath()
      ctx.rect(zone.left, zone.top, zone.width, zone.height)
      ctx.clip()
      comets.forEach((c) => {
        const local = elapsed - c.delay
        if (local < 0 || local > c.life) return
        const p = local / c.life
        const fade = Math.min(1, p * 5, (1 - p) * 4)
        const run = (local / 1000) * c.speed
        const x = c.x + dx * run
        const y = c.y + dy * run
        streak(ctx, x, y, dx, dy, c.len * Math.min(1, p * 3), Math.max(1.5, c.size * 0.45), 0.9 * fade)
        dot(ctx, x, y, c.size * 1.6, fade)
      })
      ctx.restore()
      ctx.globalAlpha = 1
      return true
    },
  })
}
