import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DROPS } from '../../data/drops'
import { FrameClock, FrameSequence, Settle, SpinCanvas, curveIndex, frameDelta, idleFps, loadManifest, pickSize, turnsAt } from '../../lib/frames'
import { gsap, ScrollTrigger, lockScroll, prefersReducedMotion, scrollToY } from '../../lib/motion'
import { StarField } from '../../lib/starfield'
import ChromeLogo from '../../components/ChromeLogo/ChromeLogo'
import DropReelStatic from './DropReelStatic'
import styles from './DropReel.module.css'

// Coordenadas do quadro (todos os giros saem em 4:3 do tools/giros).
const VB_W = 1000
const VB_H = 750
const ORBIT = { cx: 500, cy: 470, rx: 455, ry: 74, tilt: -7 }
const ORBIT_B = { cx: 500, cy: 455, rx: 395, ry: 118, tilt: 9 }

// Roteiro em "telas" de rolagem, montado para quantos tênis houver em DROPS:
// abertura, entrada do primeiro, e para cada tênis 2 telas paradas girando +
// 1 tela de troca; no fim, 1 tela de saída. Uma volta completa = TURN telas.
const STEADY = 2
const SWAP = 1
function buildScript(n) {
  const steady = []
  const swap = []
  let t = 1.6
  for (let i = 0; i < n; i += 1) {
    steady.push([t, t + STEADY])
    t += STEADY
    if (i < n - 1) {
      swap.push([t, t + SWAP])
      t += SWAP
    }
  }
  return { open: [0, 1], enter: [0.55, 1.6], steady, swap, exit: [t, t + 1] }
}
const T = buildScript(DROPS.length)
const TOTAL = T.exit[1]
// a inundação é um círculo de 100vmax (camada pequena na placa de vídeo)
// ampliado até cobrir a tela inteira a partir do tênis
const FLOOD_SCALE = 1.75
// abertura: duração mínima do carregamento (o croqui leva ~2,3 s para se desenhar)
const MIN_LOAD = 2600
const TURN = 2.9
// No topo, antes de rolar, o tênis gira sozinho quadro a quadro (FrameClock).
// Ao sair do topo o giro solto freia em ~IDLE_EASE s (não para de uma vez) e,
// até HANDOFF telas de rolagem, a diferença para uma volta inteira é
// absorvida aos poucos: dali em diante a posição depende só da rolagem e as
// chamadas continuam casando com as peças.
const TOP_AT = 0.004 // telas de rolagem que ainda contam como topo (~4 px)
const IDLE_EASE = 0.3
const HANDOFF = 1.55 // antes da primeira chamada (T.steady[0][0] = 1,6)
// até esta fração de volta o giro solto encaixa na volta de trás (anda mais
// devagar na entrada, sem nunca voltar); acima, na da frente (anda mais rápido)
const SLOW_MAX = 0.25
// abertura: o croqui some em 1 s enquanto a foto aparece na mesma pose dele;
// só depois disso o tênis começa a girar (sem duas poses sobrepostas)
const SPIN_AFTER = 1100
// céu estrelado: vira cometas ao longo de STARS_FALL telas e some quando o
// mundo do primeiro tênis cobre a tela
const STARS_FALL = 1.2
const STARS_HIDDEN = 1.45
const START_INK ={ '--ink': '#f2f3f5', '--ink2': 'rgba(242, 243, 245, 0.62)', '--line': 'rgba(233, 236, 241, 0.5)', '--logo-inv': 0 }

const lifespan = (i) => [i === 0 ? 0 : T.swap[i - 1][0], i === DROPS.length - 1 ? T.exit[1] : T.swap[i][1]]

function ellipseArcs({ cx, cy, rx, ry }) {
  return {
    back: `M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`,
    front: `M${cx + rx} ${cy} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`,
  }
}
const ARC_A = ellipseArcs(ORBIT)
const ARC_B = ellipseArcs(ORBIT_B)

// Posição da peça num ponto p (0 a 1) do trecho, pela trajetória rastreada.
function along(track, p) {
  const f = Math.min(Math.max(p, 0), 1) * (track.length - 1)
  const i = Math.min(Math.floor(f), track.length - 2)
  const t = f - i
  return [track[i][0] + (track[i + 1][0] - track[i][0]) * t, track[i][1] + (track[i + 1][1] - track[i][1]) * t]
}

// Rampa da passagem do giro solto para a rolagem: velocidade trapezoidal
// (acelera no primeiro quarto, anda constante, freia no último quarto). O
// pico é só 1,33x a média; com smoothstep seria 1,5x.
function handoffEase(x) {
  const a = 0.25
  const v = 1 / (1 - a)
  if (x <= 0) return 0
  if (x >= 1) return 1
  if (x < a) return (v * x * x) / (2 * a)
  if (x > 1 - a) return 1 - (v * (1 - x) * (1 - x)) / (2 * a)
  return v * (x - a / 2)
}

// Fase inicial do giro do tênis i (em voltas): tira a emenda da volta do
// trecho em que ele está parado na tela (ver `phase` em data/drops.js).
const phaseOf = (i) => DROPS[i].phase || 0

// Em que momento da rolagem o tênis i passa pelo trecho `at` da volta
// (dentro do seu trecho parado, para a chamada não aparecer em troca).
function calloutTime(i, at) {
  const [tin] = lifespan(i)
  const [s0, s1] = T.steady[i]
  for (let k = 0; k < 4; k += 1) {
    const a = tin + (k + at[0] - phaseOf(i)) * TURN
    const b = tin + (k + at[1] - phaseOf(i)) * TURN
    if (a >= s0 && b <= s1) return [a, b]
  }
  return null
}

export default function DropReel({ onPick, onIntroDone, catalogRef }) {
  const [reduced] = useState(prefersReducedMotion)
  const [manifests, setManifests] = useState(null)
  const [failed, setFailed] = useState(false)
  const pctRef = useRef(0) // progresso real da primeira passada (sem re-render)
  const numRef = useRef(null)
  const barRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [introDone, setIntroDone] = useState(false)

  const rootRef = useRef(null)
  const boxRef = useRef(null)
  const canvasRefs = useRef([])
  const seqs = useRef([])
  const painters = useRef([])
  const rot = useRef(DROPS.map(() => ({ v: 0 })))
  const tlRef = useRef(null)
  const boxSize = useRef({ w: 1, h: 1 })
  const starsRef = useRef(null)
  const spinFrom = useRef(Infinity) // quando o giro solto pode começar (abertura)

  // 0) header escondido enquanto a abertura roda (só se houver abertura animada)
  useLayoutEffect(() => {
    if (reduced || failed) return undefined
    const root = document.documentElement
    root.classList.add('pz-intro')
    return () => root.classList.remove('pz-intro')
  }, [reduced, failed])

  // 1) manifestos + primeira passada de quadros do primeiro tênis
  useEffect(() => {
    if (reduced) return undefined
    let alive = true
    Promise.all(DROPS.map((d) => loadManifest(d.id)))
      .then((list) => {
        if (!alive) return
        const size = pickSize()
        seqs.current = list.map((m, i) => new FrameSequence(DROPS[i].id, m, size))
        const first = seqs.current[0]
        const off = first.onProgress((seq) => {
          pctRef.current = Math.min(1, seq.settled / seq.firstPass)
          if (seq.settled >= seq.firstPass) off()
        })
        // os outros só começam depois da abertura (ver onComplete da abertura)
        first.start(6)
        setManifests(list)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    // rede travada no manifesto: melhor mostrar a versão estática do que prender a página
    const stuck = setTimeout(() => alive && setFailed((f) => f || !seqs.current.length), 9000)
    return () => {
      alive = false
      clearTimeout(stuck)
      seqs.current.forEach((seq) => seq.dispose())
    }
  }, [reduced])

  // 2) pronto quando a primeira passada chegou e as fontes carregaram
  //    (com teto de tempo, para ninguém ficar preso numa rede ruim)
  // teto fixo: conta a partir de quando os manifestos chegaram, não reinicia a cada quadro
  useEffect(() => {
    if (reduced || failed || !manifests) return undefined
    const cap = setTimeout(() => setReady(true), 6000)
    return () => clearTimeout(cap)
  }, [manifests, reduced, failed])

  // A contagem sobe no ritmo do croqui se desenhando (mínimo MIN_LOAD ms),
  // mesmo que os quadros cheguem na hora (cache): assim o desenho termina
  // antes de a abertura começar. Atualiza o número direto no DOM, sem render.
  useEffect(() => {
    if (reduced || failed || !manifests || ready) return undefined
    let fontsReady = false
    let raf = 0
    let done = false
    const t0 = performance.now()
    ;(document.fonts?.ready ?? Promise.resolve()).then(() => {
      fontsReady = true
    })
    const tick = () => {
      if (done) return
      const shown = Math.min(pctRef.current, (performance.now() - t0) / MIN_LOAD)
      if (numRef.current) numRef.current.textContent = String(Math.round(shown * 100))
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown.toFixed(3)})`
      if (shown >= 1 && fontsReady) {
        done = true
        setReady(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      done = true
      cancelAnimationFrame(raf)
    }
  }, [manifests, ready, failed, reduced])

  useEffect(() => {
    if (reduced || failed) {
      onIntroDone?.()
      return undefined
    }
    if (!ready) {
      lockScroll(true)
      return () => lockScroll(false)
    }
    return undefined
  }, [ready, reduced, failed, onIntroDone])

  // 3) croqui do tênis se desenhando enquanto carrega
  useLayoutEffect(() => {
    if (!manifests || ready) return undefined
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-part="sketch"] path',
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 1.6, ease: 'power2.inOut', stagger: { each: 0.05, from: 'start' } },
      )
    }, rootRef)
    return () => ctx.revert()
  }, [manifests, ready])

  // 4) canvas: um pintor por tênis, redimensionado com a caixa
  useLayoutEffect(() => {
    if (!manifests) return undefined
    painters.current = canvasRefs.current.map((c) => (c ? new SpinCanvas(c) : null))
    const ro = new ResizeObserver(() => {
      painters.current.forEach((p) => p?.resize())
      if (boxRef.current) boxSize.current = { w: boxRef.current.clientWidth, h: boxRef.current.clientHeight }
    })
    if (boxRef.current) ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [manifests])

  // 5) laço de desenho. Só pinta quando o giro está na tela e a aba visível,
  //    e só mexe em sombra/órbita quando a rotação muda de verdade. Sombra e
  //    ponto da órbita andam por transform (a placa de vídeo compõe, sem repintar).
  useEffect(() => {
    if (!manifests) return undefined
    const root = rootRef.current
    const box = boxRef.current
    const q = gsap.utils.selector(root)
    const wraps = q('[data-part="spin"]')
    const shadow = q('[data-part="shadow"]')[0]
    const dotBack = q('[data-part="dot-back"]')[0]
    const dotFront = q('[data-part="dot-front"]')[0]
    const tilt = (ORBIT.tilt * Math.PI) / 180
    const cosT = Math.cos(tilt)
    const sinT = Math.sin(tilt)
    let onScreen = true
    let boxW = box.clientWidth
    let boxH = box.clientHeight
    let lastR = NaN

    const ro = new ResizeObserver(() => {
      boxW = box.clientWidth
      boxH = box.clientHeight
      lastR = NaN
    })
    ro.observe(box)
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
    })
    io.observe(root)

    // Giro solto do primeiro tênis, em quadros (a posição dentro do vídeo).
    // Começa na pose do croqui (o quadro de perfil), para o desenho virar a
    // foto sem duas poses sobrepostas na abertura.
    const hero = seqs.current[0]
    const heroCount = hero?.count || 1
    const heroFps = idleFps(heroCount)
    const clock = new FrameClock(heroFps)
    const profile = hero?.manifest?.profile
    let idlePos = profile ? Math.round(curveIndex(hero.curve, heroCount, profile.progress)) : 0
    let idleVel = 0 // quadros por segundo; sobe e desce suave
    let target = null // volta inteira em que o giro solto encaixa ao sair do topo
    const lastIndex = DROPS.map(() => null)
    const settles = DROPS.map(() => new Settle())
    let lastNow = performance.now()

    // céu estrelado atrás do tênis e do logo (aparece enquanto a página carrega)
    const starCanvas = starsRef.current
    const stars = starCanvas ? new StarField(starCanvas, window.matchMedia('(max-width: 760px)').matches ? 140 : 260) : null
    const starsBorn = performance.now()
    const starsRo = new ResizeObserver(() => stars?.resize())
    if (starCanvas) starsRo.observe(starCanvas)

    const render = () => {
      const now = performance.now()
      const dtMs = Math.min(100, now - lastNow)
      lastNow = now
      if (!onScreen || document.hidden) return
      const dt = dtMs / 1000
      const tl = tlRef.current
      const at = tl ? tl.time() : 0
      const atTop = at < TOP_AT
      if (stars && at < STARS_HIDDEN) stars.draw(now / 1000, Math.min(1, at / STARS_FALL), Math.min(1, (now - starsBorn) / 1500))
      // velocidade do giro solto: no topo acelera até a cadência do relógio;
      // fora dele freia suave (sem tranco quando a rolagem começa)
      // (e só com metade dos quadros prontos: antes disso giraria aos trancos)
      const want = tl && atTop && now >= spinFrom.current && (hero?.settled ?? 0) >= heroCount / 2 ? heroFps : 0
      idleVel += (want - idleVel) * (1 - Math.exp(-dt / IDLE_EASE))
      if (Math.abs(want - idleVel) < 0.25) idleVel = want
      if (want > 0 && idleVel === want) {
        // cadência exata: um quadro inteiro por passo
        if (idlePos !== Math.round(idlePos)) {
          idlePos = Math.round(idlePos)
          clock.reset()
        }
        idlePos += clock.tick(dtMs)
      } else {
        clock.reset()
        idlePos += idleVel * dt
      }
      const idleTurns = turnsAt(hero?.curve, heroCount, idlePos)
      if (atTop) target = null
      else if (target === null) {
        // onde o giro solto vai parar depois de frear, e a volta inteira mais
        // perto disso sem andar para trás
        const end = idleTurns + (idleVel / heroCount) * IDLE_EASE
        const frac = end - Math.floor(end)
        target = frac <= SLOW_MAX ? Math.floor(end) : Math.ceil(end)
      }
      const k = target === null ? 0 : handoffEase(at / HANDOFF)
      const sway = target === null ? idleTurns : idleTurns + (target - idleTurns) * k

      let lead = 0
      let leadAlpha = -1
      for (let i = 0; i < DROPS.length; i += 1) {
        const alpha = wraps[i] ? Number(gsap.getProperty(wraps[i], 'opacity')) : 0
        if (alpha > leadAlpha) {
          leadAlpha = alpha
          lead = i
        }
        const seq = seqs.current[i]
        const painter = painters.current[i]
        if (!seq || !painter) continue
        if (alpha < 0.01) {
          if (seq.bitmaps.size > 8) seq.trim(8) // fora de cena: devolve a memória
          lastIndex[i] = null
          continue
        }
        const r = rot.current[i].v + (i === 0 ? sway : 0)
        const index = curveIndex(seq.curve, seq.count, r)
        const speed = lastIndex[i] === null ? 0 : frameDelta(lastIndex[i], index, seq.count)
        lastIndex[i] = index
        if (i === 0 && target === null) {
          // no topo, o giro solto: sempre um quadro inteiro do vídeo
          painter.draw(seq.exact(Math.round(idlePos), 1))
        } else {
          // rolando: vizinhos misturados enquanto anda (liso); parado, assenta
          // num quadro inteiro (sem duas poses congeladas)
          const v = seq.view(index, speed)
          painter.blend(v.a, v.b, settles[i].weight(v.pair, v.t, speed, dtMs))
        }
      }

      const r = rot.current[lead].v + (lead === 0 ? sway : 0)
      if (r === lastR) return
      lastR = r
      const man = seqs.current[lead]?.manifest
      const widths = man?.shadow?.w
      const w = widths ? widths[Math.floor(curveIndex(man.sizes.d.curve, widths.length, r)) % widths.length] : 0.6
      if (shadow) shadow.style.transform = `translate(-50%, -50%) scale(${w.toFixed(3)}, ${(0.7 + w * 0.45).toFixed(3)})`
      if (dotBack && dotFront) {
        const theta = r * Math.PI * 2 + 0.6
        const dx = ORBIT.rx * Math.cos(theta)
        const dy = ORBIT.ry * Math.sin(theta)
        const x = ((ORBIT.cx + dx * cosT - dy * sinT) / VB_W) * boxW
        const y = ((ORBIT.cy + dx * sinT + dy * cosT) / VB_H) * boxH
        const move = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        dotBack.style.transform = move
        dotFront.style.transform = move
        const behind = Math.sin(theta) < 0
        dotBack.style.opacity = behind ? '1' : '0'
        dotFront.style.opacity = behind ? '0' : '1'
      }
    }
    gsap.ticker.add(render)
    return () => {
      gsap.ticker.remove(render)
      ro.disconnect()
      io.disconnect()
      starsRo.disconnect()
    }
  }, [manifests])

  // 6) abertura (uma vez) + roteiro amarrado à rolagem. O roteiro fica num
  //    gsap.matchMedia: se o layout muda (celular girado, janela redimensionada
  //    passando do ponto de quebra), ele é desmontado e montado de novo.
  useLayoutEffect(() => {
    if (!ready) return undefined
    const root = rootRef.current
    const q = gsap.utils.selector(root)

    // o tênis fica parado na pose do croqui enquanto o desenho vira foto
    spinFrom.current = performance.now() + SPIN_AFTER
    const intro = gsap.context(() => {
      gsap.set(canvasRefs.current.slice(1), { opacity: 1 })
      gsap
        .timeline({
          onComplete: () => {
            setIntroDone(true)
            onIntroDone?.()
            // Os outros giros só entram na fila quando a pessoa começa a rolar
            // (ou depois de 4 s parada): o giro do topo roda sem disputa.
            const startOthers = () => {
              window.removeEventListener('scroll', startOthers)
              clearTimeout(othersTimer)
              seqs.current.forEach((seq) => seq.start(3))
            }
            const othersTimer = setTimeout(startOthers, 4000)
            window.addEventListener('scroll', startOthers, { passive: true, once: true })
          },
        })
        .to(q('[data-part="sketch"]'), { opacity: 0, duration: 1, ease: 'power2.out' }, 0)
        .to(q('[data-part="loader"]'), { autoAlpha: 0, duration: 0.5 }, 0)
        // sem escala: a foto nasce exatamente em cima do croqui
        .fromTo(canvasRefs.current[0], { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power3.out' }, 0.15)
        .fromTo(q('[data-part="logo-in"]'), { clipPath: 'inset(100% 0% 0% 0%)', yPercent: 18 }, { clipPath: 'inset(0% 0% 0% 0%)', yPercent: 0, duration: 1.3, ease: 'power4.out' }, 0.25)
        .fromTo(q('[data-part="cue-in"]'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 1)
    }, root)

    const mm = gsap.matchMedia(root)
    // "desktop" garante que sempre há uma condição verdadeira (o matchMedia só
    // roda a função quando pelo menos uma bate)
    mm.add({ mobile: '(max-width: 760px)', desktop: '(min-width: 761px)', touch: '(pointer: coarse)' }, (context) => {
      const { mobile, touch } = context.conditions
      const stage = q('[data-part="stage"]')[0]
      const box = q('[data-part="box"]')[0]
      const wraps = q('[data-part="spin"]')
      const worlds = q('[data-part="world"]')
      const floods = q('[data-part="flood"]')
      const names = q('[data-part="name"]')
      const infos = q('[data-part="info"]')
      const orbits = q('[data-part="orbit"] path:not([data-dash])')
      const dashed = q('[data-part="orbit"] path[data-dash]')
      const nav = q('[data-part="nav"]')[0]
      const fills = q('[data-part="nav-fill"]')
      const fillAxis = mobile ? 'scaleY' : 'scaleX' // no celular o trilho é vertical
      const shift = mobile ? 72 : 42
      // o header (fora do palco) usa a mesma tinta do capítulo
      const header = document.querySelector('[data-pz-header]')
      const inked = [stage, header].filter(Boolean)

      // estado inicial do roteiro
      // cópia: o React congela o objeto usado em style={} e o GSAP escreve nos vars
      gsap.set(inked, { ...START_INK })
      gsap.set(box, { scale: mobile ? 0.8 : 0.64, yPercent: mobile ? 14 : 16 })
      gsap.set(wraps, { autoAlpha: 0 })
      gsap.set(wraps[0], { autoAlpha: 1 })
      gsap.set(worlds, { autoAlpha: 0 })
      gsap.set(floods, { scale: 0, autoAlpha: 1 })
      gsap.set(names, { autoAlpha: 0, yPercent: 12 })
      gsap.set(q('[data-part="name-clip"]'), { xPercent: -100 })
      gsap.set(q('[data-part="name-fill"]'), { xPercent: 100 })
      gsap.set(infos, { autoAlpha: 0, y: 28 })
      gsap.set(orbits, { drawSVG: '0%' })
      gsap.set(dashed, { autoAlpha: 0 })
      gsap.set(q('[data-part="dot"]'), { autoAlpha: 0 })
      gsap.set(nav, { autoAlpha: 0 })
      gsap.set(fills, { scaleX: 1, scaleY: 1, [fillAxis]: 0, transformOrigin: mobile ? 'center top' : 'left center' })
      gsap.set(q('[data-part="callout"]'), { autoAlpha: 0 })
      // etiquetas: centradas na altura da linha e do lado de fora da peça
      const labels = {}
      q('[data-part="callout-label"]').forEach((el) => {
        const left = el.dataset.side === 'left'
        labels[el.dataset.label] = el
        gsap.set(el, { autoAlpha: 0, xPercent: left ? -100 : 0, x: left ? -10 : 10, yPercent: -50, y: 8 })
      })
      gsap.set(q('[data-part="blackout"]'), { autoAlpha: 0 })

      // Onde fica cada etiqueta (px, na caixa do tênis): do lado de fora da
      // peça, abaixo do nome gigante do capítulo (etiqueta em cima das letras
      // do nome não se lê) e acima da ficha e da navegação. Recalcula quando
      // o palco muda de tamanho e quando as fontes terminam de carregar.
      const spots = {}
      const layoutLabels = () => {
        const w = box.clientWidth
        const h = box.clientHeight
        const bx = box.offsetLeft
        const by = box.offsetTop
        const sw = stage.clientWidth
        DROPS.forEach((drop, i) => {
          const outline = names[i]?.firstElementChild
          const nameBottom = outline ? names[i].offsetTop + outline.offsetTop + outline.offsetHeight - by : 0
          drop.callouts.forEach((c, k) => {
            const key = `${i}-${k}`
            const el = labels[key]
            if (!el) return
            const left = el.dataset.side === 'left'
            const lw = el.offsetWidth
            const lh = el.offsetHeight
            // no x do roteiro, mas sem sair do palco
            let tx = c.text[0] * w
            tx = left ? Math.max(tx, -bx + 16 + lw + 10) : Math.min(tx, sw - bx - 16 - lw - 10)
            const x0 = left ? tx - 10 - lw : tx + 10
            const x1 = x0 + lw
            // chão: a ficha e a navegação que ficarem embaixo da etiqueta
            let floor = h * 0.94
            ;[infos[i], nav].forEach((block) => {
              if (!block) return
              const ex0 = block.offsetLeft - bx
              if (x1 > ex0 && x0 < ex0 + block.offsetWidth) floor = Math.min(floor, block.offsetTop - by - 12)
            })
            // na altura da peça, entre o nome e o chão
            const mid = along(c.track, 0.5)[1] * h
            const ty = Math.max(nameBottom + 14 + lh / 2, Math.min(mid, floor - lh / 2))
            spots[key] = { tx, ty }
            el.style.left = `${tx.toFixed(1)}px`
            el.style.top = `${ty.toFixed(1)}px`
          })
        })
      }
      layoutLabels()
      const labelsRo = new ResizeObserver(layoutLabels)
      labelsRo.observe(stage)
      document.fonts?.ready.then(layoutLabels)

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: touch ? 0.45 : true,
          invalidateOnRefresh: true,
        },
      })
      tlRef.current = tl

      // rotação de cada tênis: linear, uma volta a cada TURN telas
      DROPS.forEach((_, i) => {
        const [tin, tout] = lifespan(i)
        tl.fromTo(rot.current[i], { v: phaseOf(i) }, { v: phaseOf(i) + (tout - tin) / TURN, duration: tout - tin }, tin)
      })

      // abertura -> capítulo 1
      tl.to(q('[data-part="logo"]'), { yPercent: -60, scale: 0.82, autoAlpha: 0, duration: 1, ease: 'power1.in' }, 0.05)
        .to(q('[data-part="cue"]'), { autoAlpha: 0, duration: 0.25 }, 0)
        .to(box, { scale: 1, yPercent: 0, duration: 1.2, ease: 'power2.inOut' }, 0.1)
        .to(floods[0], { scale: FLOOD_SCALE, duration: 0.7, ease: 'power2.in' }, T.enter[0])
        .to(worlds[0], { autoAlpha: 1, duration: 0.35 }, T.enter[0] + 0.45)
        .to(floods[0], { autoAlpha: 0, duration: 0.3 }, T.enter[0] + 0.7)
        .to(inked, { ...inkOf(0), duration: 0.4 }, T.enter[0] + 0.45)
        .to(orbits, { drawSVG: '100%', duration: 0.8, stagger: 0.12, ease: 'power2.out' }, T.enter[0] + 0.4)
        .to(dashed, { autoAlpha: 1, duration: 0.6 }, T.enter[0] + 0.6)
        .to(q('[data-part="dot"]'), { autoAlpha: 1, duration: 0.4 }, T.enter[0] + 0.8)
        .to(names[0], { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: 'power2.out' }, T.enter[0] + 0.55)
        .to(infos[0], { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, T.enter[1] - 0.45)
        .to(nav, { autoAlpha: 1, duration: 0.4 }, T.enter[1] - 0.4)

      DROPS.forEach((drop, i) => {
        const [s0, s1] = T.steady[i]
        const len = s1 - s0
        // nome gigante enche de cromo conforme a volta avança
        tl.to(q(`[data-drop="${i}"] [data-part="name-clip"]`), { xPercent: 0, duration: len }, s0)
        tl.to(q(`[data-drop="${i}"] [data-part="name-fill"]`), { xPercent: 0, duration: len }, s0)
        tl.to(fills[i], { [fillAxis]: 1, duration: len }, s0)
        drop.callouts.forEach((c, k) => {
          const win = calloutTime(i, c.at)
          if (!win) return
          const [a, b] = win
          const g = q(`[data-drop="${i}"][data-callout="${k}"]`)[0]
          const leg1 = g.querySelector('[data-leg="1"]')
          const leg2 = g.querySelector('[data-leg="2"]')
          const dot = g.querySelector('[data-anchor]')
          const label = q(`[data-label="${i}-${k}"]`)
          // ponto e linha acompanham a peça enquanto o tênis gira; as pernas
          // (100 px de base) esticam por scaleX, então é só transform
          const follow = { p: 0, d1: 0, d2: 0 }
          const place = () => {
            const { w, h } = boxSize.current
            const [px, py] = along(c.track, follow.p)
            const ax = px * w
            const ay = py * h
            const { tx, ty } = spots[`${i}-${k}`] ?? { tx: c.text[0] * w, ty: c.text[1] * h }
            const kx = tx + (ax - tx) * 0.32
            const dx = kx - ax
            const dy = ty - ay
            const len = Math.hypot(dx, dy)
            dot.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)`
            leg1.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) rotate(${Math.atan2(dy, dx).toFixed(4)}rad) scaleX(${((len / 100) * follow.d1).toFixed(4)})`
            leg2.style.transform = `translate3d(${kx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scaleX(${(((tx - kx) / 100) * follow.d2).toFixed(4)})`
          }
          place()
          // Tudo termina de entrar antes de começar a sair (a saída começa no
          // fim do trecho). Com a saída marcada a partir do fim e a entrada a
          // partir do começo, nos trechos curtos a etiqueta "saía" antes de
          // entrar e ficava presa na tela, uma em cima da outra.
          const span = b - a
          const grow = Math.min(0.12, span * 0.3)
          tl.to(follow, { p: 1, duration: span, onUpdate: place }, a)
            .to(g, { autoAlpha: 1, duration: 0.08 }, a)
            .to(follow, { d1: 1, duration: grow, ease: 'power2.out', onUpdate: place }, a)
            .to(follow, { d2: 1, duration: grow, ease: 'power2.out', onUpdate: place }, a + grow * 0.8)
            .to(label, { autoAlpha: 1, y: 0, duration: grow, ease: 'power2.out' }, a + grow)
            .to(g, { autoAlpha: 0, duration: 0.12 }, b)
            .to(label, { autoAlpha: 0, y: -6, duration: 0.12 }, b)
        })
      })

      // trocas entre capítulos
      T.swap.forEach(([w0, w1], s) => {
        const from = s
        const to = s + 1
        tl.to(wraps[from], { xPercent: -shift, scale: 0.72, rotation: -8, autoAlpha: 0, duration: 0.7, ease: 'power2.in' }, w0)
          .fromTo(wraps[to], { xPercent: shift, scale: 0.72, rotation: 8, autoAlpha: 0 }, { xPercent: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: 0.7, ease: 'power2.out', immediateRender: false }, w0 + 0.3)
          .to(names[from], { autoAlpha: 0, yPercent: -10, duration: 0.35, ease: 'power1.in' }, w0)
          .to(infos[from], { autoAlpha: 0, y: -18, duration: 0.3, ease: 'power1.in' }, w0)
          .to(floods[to], { scale: FLOOD_SCALE, duration: 0.6, ease: 'power2.in' }, w0 + 0.1)
          .to(worlds[to], { autoAlpha: 1, duration: 0.3 }, w0 + 0.5)
          .to(worlds[from], { autoAlpha: 0, duration: 0.2 }, w0 + 0.75)
          .to(floods[to], { autoAlpha: 0, duration: 0.25 }, w0 + 0.7)
          .to(inked, { ...inkOf(to), duration: 0.35 }, w0 + 0.45)
          .to(names[to], { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'power2.out' }, w0 + 0.55)
          .to(infos[to], { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, w1 - 0.35)
      })

      // saída: o tênis encolhe e desce para a loja, a cor apaga
      const last = DROPS.length - 1
      const [e0, e1] = T.exit
      tl.to(names[last], { autoAlpha: 0, yPercent: -10, duration: 0.35 }, e0)
        .to(infos[last], { autoAlpha: 0, y: -18, duration: 0.3 }, e0)
        .to(nav, { autoAlpha: 0, duration: 0.3 }, e0)
        .to(orbits, { drawSVG: '0%', duration: 0.5, ease: 'power2.in' }, e0)
        .to(dashed, { autoAlpha: 0, duration: 0.4 }, e0)
        .to(q('[data-part="dot"]'), { autoAlpha: 0, duration: 0.3 }, e0)
        .to(box, { scale: 0.5, yPercent: 26, duration: 1, ease: 'power2.in' }, e0)
        .to(wraps[last], { autoAlpha: 0, duration: 0.4 }, e1 - 0.45)
        .to(q('[data-part="blackout"]'), { autoAlpha: 1, duration: 0.8 }, e0 + 0.15)
        .to(inked, { ...START_INK, duration: 0.5 }, e0 + 0.4)
        .set({}, {}, TOTAL)

      // depois do giro o header vira vidro escuro
      if (header) {
        ScrollTrigger.create({
          trigger: root,
          start: 'bottom 70px',
          end: 'max',
          onToggle: (self) => header.classList.toggle('pz-solid', self.isActive),
        })
      }
      return () => {
        tlRef.current = null
        labelsRo.disconnect()
        header?.classList.remove('pz-solid')
      }
    })

    requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => {
      tlRef.current = null
      mm.revert()
      intro.revert()
    }
  }, [ready, onIntroDone])

  const jumpTo = useCallback((i) => {
    const root = rootRef.current
    const tl = tlRef.current
    if (!root || !tl) return
    const st = tl.scrollTrigger
    const target = T.steady[i][0] + 0.02
    scrollToY(st.start + (st.end - st.start) * (target / TOTAL))
  }, [])

  const toCatalog = useCallback(() => {
    const el = catalogRef?.current
    if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY - 70)
  }, [catalogRef])

  if (reduced || failed) return <DropReelStatic onPick={onPick} />

  const profile = manifests?.[0]?.profile
  const sketchBox = manifests?.[0]?.sizes?.d

  return (
    <section
      ref={rootRef}
      className={styles.reel}
      style={{ '--screens': TOTAL + 1 }}
      aria-label="Os drops girando"
    >
      <div className={styles.stage} data-part="stage" style={{ ...START_INK }}>
        <canvas ref={starsRef} className={styles.stars} aria-hidden="true" />
        {DROPS.map((d, i) => (
          <div key={d.id} className={styles.world} data-part="world" style={{ background: d.world.bg }} aria-hidden="true" />
        ))}
        {DROPS.map((d) => (
          <div key={d.id} className={styles.flood} data-part="flood" style={{ background: d.world.base }} aria-hidden="true" />
        ))}

        <div className={styles.logo} data-part="logo">
          <div data-part="logo-in" className={styles.logoIn}>
            <ChromeLogo />
          </div>
        </div>

        {DROPS.map((d, i) => (
          <div key={d.id} className={styles.name} data-part="name" data-drop={i} aria-hidden="true">
            <span className={styles.nameOutline}>{d.word}</span>
            <span className={styles.nameClip} data-part="name-clip">
              <span className={styles.nameFill} data-part="name-fill" style={{ backgroundImage: d.world.nameFill || 'var(--pz-chrome)' }}>
                {d.word}
              </span>
            </span>
          </div>
        ))}

        <div ref={boxRef} className={styles.box} data-part="box">
          <svg className={styles.layer} viewBox={`0 0 ${VB_W} ${VB_H}`} data-part="orbit" aria-hidden="true">
            <g transform={`rotate(${ORBIT.tilt} ${ORBIT.cx} ${ORBIT.cy})`}>
              <path d={ARC_A.back} className={styles.orbit} />
            </g>
            <g transform={`rotate(${ORBIT_B.tilt} ${ORBIT_B.cx} ${ORBIT_B.cy})`}>
              <path d={ARC_B.back} className={`${styles.orbit} ${styles.orbitDash}`} data-dash />
            </g>
          </svg>

          <span className={styles.shadow} data-part="shadow" aria-hidden="true" />
          <span className={styles.dotLayer} data-part="dot" aria-hidden="true">
            <span className={styles.dot} data-part="dot-back" />
          </span>

          {DROPS.map((d, i) => (
            <div key={d.id} className={styles.spin} data-part="spin">
              <canvas ref={(el) => (canvasRefs.current[i] = el)} className={styles.canvas} aria-hidden="true" />
            </div>
          ))}

          <svg className={styles.layer} viewBox={`0 0 ${VB_W} ${VB_H}`} data-part="orbit" aria-hidden="true">
            <g transform={`rotate(${ORBIT.tilt} ${ORBIT.cx} ${ORBIT.cy})`}>
              <path d={ARC_A.front} className={styles.orbit} />
            </g>
            <g transform={`rotate(${ORBIT_B.tilt} ${ORBIT_B.cx} ${ORBIT_B.cy})`}>
              <path d={ARC_B.front} className={`${styles.orbit} ${styles.orbitDash}`} data-dash />
            </g>
          </svg>

          <span className={styles.dotLayer} data-part="dot" aria-hidden="true">
            <span className={styles.dot} data-part="dot-front" />
          </span>

          {/* chamadas: linha (duas pernas) e ponto são elementos movidos só por
              transform, para acompanhar a peça sem redesenhar nada */}
          {DROPS.map((d, i) =>
            d.callouts.map((c, k) => (
              <div key={`${d.id}-${k}`} className={styles.callout} data-part="callout" data-drop={i} data-callout={k} aria-hidden="true">
                <span className={styles.leg} data-leg="1" />
                <span className={styles.leg} data-leg="2" />
                <span className={styles.anchor} data-anchor>
                  <span className={styles.anchorRing} />
                </span>
              </div>
            )),
          )}
          {DROPS.map((d, i) =>
            d.callouts.map((c, k) => (
              <span
                key={`${d.id}-l${k}`}
                className={styles.label}
                data-side={c.text[0] < c.track[3][0] ? 'left' : 'right'}
                data-part="callout-label"
                data-label={`${i}-${k}`}
                style={{ '--label-bg': d.world.base }}
              >
                {c.label}
              </span>
            )),
          )}

          {profile && sketchBox && !introDone && (
            <svg className={styles.sketch} viewBox={`0 0 ${sketchBox.w} ${sketchBox.h}`} data-part="sketch" aria-hidden="true">
              <path d={profile.outline} className={styles.sketchOutline} />
              {profile.lines.map((d, i) => (
                <path key={i} d={d} className={styles.sketchLine} />
              ))}
            </svg>
          )}
        </div>

        {DROPS.map((d, i) => (
          <div key={d.id} className={styles.info} data-part="info" data-drop={i}>
            <h2 className={styles.infoName}>{d.name}</h2>
            <p className={styles.infoLine}>{d.line}</p>
            <dl className={styles.specs}>
              {d.specs.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.buy}>
              <span className={styles.price}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.price)}
              </span>
              <button type="button" className="pz-btn" onClick={() => onPick?.(d)}>
                Quero esse
              </button>
            </div>
          </div>
        ))}

        <nav className={styles.nav} data-part="nav" aria-label="Escolher tênis">
          {DROPS.map((d, i) => (
            <button key={d.id} type="button" className={styles.navItem} onClick={() => jumpTo(i)} aria-label={`Ir para ${d.name}`}>
              <span className={styles.navTrack}>
                <span className={styles.navFill} data-part="nav-fill" />
              </span>
              <span className={styles.navLabel}>{d.word}</span>
            </button>
          ))}
          <button type="button" className={styles.navSkip} onClick={toCatalog}>
            Pular para a loja
          </button>
        </nav>

        <div className={styles.cue} data-part="cue" aria-hidden="true">
          <div className={styles.cueIn} data-part="cue-in">
          <svg viewBox="0 0 64 64" className={styles.cueIcon}>
            <ellipse cx="32" cy="36" rx="24" ry="8" className={styles.cueOrbit} />
            <path d="M52 30c-3-3-10-5-20-5" className={styles.cueArrow} />
            <path d="M47 24l6 6-7 3" className={styles.cueArrow} />
            <line x1="32" y1="46" x2="32" y2="60" className={styles.cueLine} />
          </svg>
          <span>Role para girar</span>
          </div>
        </div>

        <div className={styles.loader} data-part="loader" role="status">
          <span className={styles.loaderNum} ref={numRef}>
            0
          </span>
          <span className={styles.loaderBar}>
            <span ref={barRef} style={{ transform: 'scaleX(0)' }} />
          </span>
          <span className="pz-visually-hidden">Carregando o giro</span>
        </div>

        <div className={styles.blackout} data-part="blackout" aria-hidden="true" />
      </div>
    </section>
  )
}

function inkOf(i) {
  const w = DROPS[i].world
  return { '--ink': w.ink, '--ink2': w.ink2, '--line': w.line, '--logo-inv': w.logoInv || 0 }
}
