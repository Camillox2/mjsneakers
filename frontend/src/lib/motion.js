import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import Lenis from 'lenis'
import { MQ } from './breakpoints'

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin)

// A barra de endereço do celular encolhe/estica durante a rolagem; sem isso o
// ScrollTrigger recalcula tudo a cada mudança e o giro dá um tranco.
ScrollTrigger.config({ ignoreMobileResize: true })

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Rolagem suave só com mouse/trackpad. No toque a rolagem nativa do celular é
// a mais fluida que existe; suavizar por cima só atrasa o dedo.
const wantsSmooth = () =>
  typeof window !== 'undefined' && window.matchMedia(MQ.hover).matches && !prefersReducedMotion()

let lenis = null
let locks = 0

export function startSmoothScroll() {
  if (lenis || !wantsSmooth()) return lenis
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  if (locks > 0) lenis.stop() // alguém travou a rolagem antes do Lenis existir
  return lenis
}

const tick = (time) => lenis?.raf(time * 1000)

export function stopSmoothScroll() {
  if (!lenis) return
  gsap.ticker.remove(tick)
  lenis.destroy()
  lenis = null
}

export function getLenis() {
  return lenis
}

function jump(y, smooth) {
  if (lenis) lenis.scrollTo(y, { immediate: !smooth, duration: smooth ? 1.2 : 0, force: true })
  else window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'instant' })
}

// Véu preto para saltos longos: atravessar o giro inteiro rolando dispara
// todas as animações do caminho de uma vez (e trava). Longe demais, a tela
// escurece, salta e reaparece.
let veil = null
function getVeil() {
  if (veil) return veil
  veil = document.createElement('div')
  veil.setAttribute('aria-hidden', 'true')
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2000',
    background: '#000',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.22s cubic-bezier(0.65, 0, 0.35, 1)',
  })
  document.body.appendChild(veil)
  return veil
}

export function scrollToY(y, { immediate = false } = {}) {
  if (immediate || prefersReducedMotion()) {
    jump(y, false)
    return
  }
  const far = Math.abs(y - window.scrollY) > window.innerHeight * 2.5
  if (!far) {
    jump(y, true)
    return
  }
  const v = getVeil()
  v.style.pointerEvents = 'auto'
  v.style.opacity = '1'
  setTimeout(() => {
    jump(y, false)
    ScrollTrigger.update()
    // dois quadros para a página desenhar no destino antes de revelar
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        v.style.opacity = '0'
        v.style.pointerEvents = 'none'
      }),
    )
  }, 230)
}

// Altura real do header (muda no celular e com o entalhe da tela): é o quanto
// um salto para uma seção precisa descontar para ela não ficar embaixo dele.
export function headerHeight() {
  if (typeof document === 'undefined') return 70
  const el = document.querySelector('[data-pz-header]')
  return el ? Math.round(el.getBoundingClientRect().height) : 70
}

export function scrollToEl(el, offset) {
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY + (offset ?? -headerHeight())
  scrollToY(y)
}

export function lockScroll(locked) {
  locks = Math.max(0, locks + (locked ? 1 : -1))
  const on = locks > 0
  if (lenis) {
    if (on) lenis.stop()
    else lenis.start()
  }
  const root = document.documentElement.style
  root.overflow = on ? 'hidden' : ''
  // sem isto o arrasto no fim de uma lista da camada ainda puxa a página
  root.overscrollBehavior = on ? 'none' : ''
}

export { gsap, ScrollTrigger }
