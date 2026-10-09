import { useLayoutEffect } from 'react'
import { gsap, prefersReducedMotion } from './motion'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Velocidades das colunas do "No pé" (yPercent ao longo da passagem).
export const NO_PE_SPEED = [-8, 10, -4]
// Um card tem mais ou menos 2/3 da altura de uma coluna do "No pé" (duas fotos
// 3:4); com 1,5× o yPercent, o card anda os mesmos px por px de rolagem.
export const CARD_SPEED = NO_PE_SPEED.map((s) => s * 1.5)

// Altura da página mudou depois que os gatilhos foram medidos (seções que
// carregam dados, imagens, o giro fixado lá em cima): recalcula. Um só
// observador para a página toda, ligado enquanto houver paralaxe na tela.
let users = 0
let ro = null
let timer = 0
let lastH = 0
function watchLayout() {
  users += 1
  if (ro || typeof ResizeObserver === 'undefined') return
  lastH = document.body.scrollHeight
  ro = new ResizeObserver(() => {
    const h = document.body.scrollHeight
    if (Math.abs(h - lastH) < 2) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      lastH = document.body.scrollHeight
      ScrollTrigger.refresh()
    }, 180)
  })
  ro.observe(document.body)
}
function unwatchLayout() {
  users -= 1
  if (users > 0 || !ro) return
  ro.disconnect()
  ro = null
  clearTimeout(timer)
}

/**
 * Paralaxe do "No pé": cada elemento anda numa velocidade na rolagem (só
 * transform, scrub do ScrollTrigger, ease linear). É o mesmo caminho usado
 * pelo OnFeet, pela fileira de promoções e por /promocoes.
 *
 * - selector: elementos que andam (dentro de ref)
 * - speeds: yPercent de cada um; o índice vem de data-par ou da posição
 * - trigger: 'root' (a seção inteira, como no "No pé") ou uma função el => gatilho
 * - keepGap: para colunas longas com um gatilho por card. Cards vizinhos na
 *   mesma coluna estão em pontos diferentes da passagem e se aproximariam ou
 *   afastariam; a margem de cima de cada card compensa isso e o vão na tela
 *   fica igual a keepGap(el) px.
 */
export function useScrollParallax(ref, { selector = '[data-col]', speeds = NO_PE_SPEED, trigger = 'root', keepGap = null, deps = [] } = {}) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return undefined
    watchLayout()
    const speedOf = (el, i) => {
      const k = el.dataset.par != null ? Number(el.dataset.par) : i
      return speeds[k % speeds.length] / 100
    }
    let els = []
    const fixGaps = () => {
      if (!keepGap) return
      const vh = window.innerHeight
      els.forEach((el, i) => {
        const box = typeof trigger === 'function' ? trigger(el) : el
        if (!box.previousElementSibling) {
          box.style.marginTop = ''
          return
        }
        const h = el.offsetHeight
        const s = (2 * speedOf(el, i) * h) / (h + vh) // px de transform por px de rolagem
        const g = keepGap(el)
        box.style.marginTop = `${Math.round((g + s * h) / (1 - s))}px`
      })
    }
    const ctx = gsap.context(() => {
      els = gsap.utils.toArray(selector)
      fixGaps()
      els.forEach((el, i) => {
        const s = speedOf(el, i) * 100
        gsap.fromTo(el, { yPercent: -s }, {
          yPercent: s,
          ease: 'none',
          scrollTrigger: {
            trigger: trigger === 'root' ? root : trigger(el),
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            // mede depois do giro fixado e do resto da página
            refreshPriority: -1,
          },
        })
      })
    }, root)
    if (keepGap) ScrollTrigger.addEventListener('refreshInit', fixGaps)
    return () => {
      if (keepGap) ScrollTrigger.removeEventListener('refreshInit', fixGaps)
      els.forEach((el) => {
        const box = typeof trigger === 'function' ? trigger(el) : el
        if (keepGap) box.style.marginTop = ''
      })
      ctx.revert()
      unwatchLayout()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
