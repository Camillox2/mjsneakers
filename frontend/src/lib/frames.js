// Sequências de quadros dos giros (geradas por tools/giros).
//
// Por que quadros e não vídeo: pular o currentTime de um MP4 a cada evento de
// rolagem obriga o navegador a decodificar a partir do último quadro-chave, e
// o giro engasga (principalmente no iPhone). Aqui cada quadro é uma imagem
// própria e o canvas desenha a que a rolagem pedir.
//
// Memória: um quadro de 860x646 decodificado ocupa ~2,2 MB. Guardar os ~120
// quadros dos três giros decodificados passaria de 700 MB e derruba a aba no
// iPad. Por isso os arquivos ficam comprimidos (~25 KB cada) e só uma janela
// de quadros em volta do que está na tela fica decodificada (LRU), com os
// vizinhos sendo preparados antes de a rolagem chegar neles.
//
// Carregamento progressivo: primeiro 1 quadro a cada 16, depois a cada 8, 4,
// 2 e 1. Com poucos quadros o giro já responde à rolagem inteiro, só com passo
// maior, e vai ficando liso enquanto o resto chega.

const manifests = new Map()

export function loadManifest(id) {
  if (!manifests.has(id)) {
    const pending = fetch(`/giros/${id}/manifest.json`).then((res) => {
      if (!res.ok) throw new Error(`Giro ${id} sem manifest (${res.status})`)
      return res.json()
    })
    // falha de rede não pode ficar guardada: a próxima tentativa busca de novo
    pending.catch(() => manifests.delete(id))
    manifests.set(id, pending)
  }
  return manifests.get(id)
}

// Celular, tablet (toque) e economia de dados usam os quadros menores.
export function pickSize() {
  if (typeof window === 'undefined') return 'd'
  const narrow = Math.min(window.screen.width, window.screen.height) < 700
  const touch = window.matchMedia('(pointer: coarse)').matches
  const saveData = navigator.connection?.saveData
  return narrow || touch || saveData ? 'm' : 'd'
}

// Quantos quadros decodificados cada giro mantém (d ~60 MB, m ~40 MB).
const BUDGET = { d: 36, m: 48 }
const AHEAD = 8 // quadros preparados à frente, no sentido do giro
const BEHIND = 2
// Acima disto (quadros andados numa atualização de tela) o olho não separa
// quadros vizinhos: o giro desenha um quadro a cada 2, 4 ou 8, e só esses são
// decodificados. Assim a decodificação acompanha uma rolagem rápida em vez de
// ficar para trás (era o tranco ao começar a rolar).
const FAST = 2.5

const mod = (a, n) => ((a % n) + n) % n

// Posição (fracionária) do quadro que mostra a fração r da volta. Os vídeos
// não giram em velocidade constante: a curva de tempo do manifesto diz quanto
// da volta cada quadro representa. Sem curva, quadros igualmente espaçados.
export function curveIndex(curve, count, r) {
  const x = ((r % 1) + 1) % 1
  if (!curve || curve.length !== count) return x * count
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (curve[mid] <= x) lo = mid
    else hi = mid - 1
  }
  const next = lo + 1 < count ? curve[lo + 1] : 1
  return lo + (x - curve[lo]) / Math.max(next - curve[lo], 1e-6)
}

// O inverso: quantas voltas representa a posição `pos` (em quadros, pode
// passar de uma volta). curveIndex(turnsAt(p)) devolve p de novo.
export function turnsAt(curve, count, pos) {
  const turns = Math.floor(pos / count)
  const f = pos - turns * count
  if (!curve || curve.length !== count) return turns + f / count
  const i = Math.min(Math.floor(f), count - 1)
  const c0 = curve[i]
  const c1 = i + 1 < count ? curve[i + 1] : 1
  return turns + c0 + (c1 - c0) * (f - i)
}

// Diferença de posição entre dois desenhos, pelo caminho mais curto da volta.
export function frameDelta(from, to, count) {
  let d = to - from
  if (d > count / 2) d -= count
  if (d < -count / 2) d += count
  return d
}

// Quadros por segundo do giro sozinho: uma volta em ~5,5 s. Os vídeos têm de
// 140 a 190 quadros por volta, então rodam a 30 (a velocidade do próprio
// vídeo); um giro com muito mais quadros rodaria a 60. Sempre cadência inteira.
export function idleFps(count) {
  return count / 5.5 >= 45 ? 60 : 30
}

// Relógio do giro sozinho: anda um número inteiro de quadros no ritmo do
// tempo real (fps quadros por segundo), sempre quadro inteiro. Conta tempo,
// não atualizações de tela: estimar a taxa da tela pelos primeiros quadros
// errava com a página ocupada e o giro disparava no dobro da velocidade.
export class FrameClock {
  constructor(fps) {
    this.fps = fps
    this.acc = 0
  }

  reset() {
    this.acc = 0
  }

  // dtMs: tempo desde a última chamada. Devolve quantos quadros andar agora.
  tick(dtMs) {
    const dur = 1000 / this.fps
    this.acc += Math.min(Math.max(dtMs, 0), dur * 3) // travada longa não vira rajada
    // folga de 4 ms: o passo que venceria logo depois desta atualização de
    // tela sai agora (os intervalos variam ~1 ms e isso não pode virar passo
    // pulado ou repetido: 60 Hz a 30 q/s fica 1, 0, 1, 0 certinho)
    const steps = Math.floor((this.acc + 4) / dur)
    this.acc -= steps * dur
    return steps
  }
}

// Mistura só com o giro andando. Em movimento, dois quadros vizinhos
// misturados deixam o giro liso; parado, o peso vai para o quadro mais perto
// em ~0,1 s (duas poses congeladas na tela é o que parecia fantasma).
export class Settle {
  constructor() {
    this.w = 0
    this.pair = -1
    this.still = 0
  }

  weight(pair, t, speed, dtMs) {
    this.still = Math.abs(speed) > 0.01 ? 0 : this.still + dtMs
    if (pair !== this.pair) {
      this.pair = pair
      this.w = t
    }
    const goal = this.still > 80 ? (t < 0.5 ? 0 : 1) : t
    this.w += (goal - this.w) * Math.min(1, dtMs / 60)
    if (Math.abs(goal - this.w) < 0.02) this.w = goal
    return this.w
  }
}

function strideOrder(count) {
  const order = []
  const seen = new Set()
  for (const step of [16, 8, 4, 2, 1]) {
    for (let i = 0; i < count; i += step) {
      if (!seen.has(i)) {
        seen.add(i)
        order.push(i)
      }
    }
  }
  return order
}

async function decode(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)
  // navegador sem createImageBitmap: <img> com URL temporária
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await img.decode()
  img.close = () => URL.revokeObjectURL(url)
  return img
}

export class FrameSequence {
  constructor(id, manifest, size) {
    this.id = id
    this.size = size
    this.manifest = manifest
    this.count = manifest.sizes[size].n
    this.curve = manifest.sizes[size].curve || null
    this.blobs = new Array(this.count).fill(null)
    this.bitmaps = new Map() // índice -> quadro decodificado; a ordem da Map é o LRU
    this.decoding = new Set()
    this.budget = BUDGET[size] ?? 36
    this.ready = 0
    this.settled = 0 // baixados + falhos: a fila anda mesmo se um quadro não vier
    this.firstPass = strideOrder(this.count).filter((i) => i % 16 === 0).length
    this.listeners = new Set()
    this.started = false
    this.disposed = false
  }

  url(i) {
    const rev = this.manifest.rev ? `?v=${this.manifest.rev}` : ''
    return `/giros/${this.id}/${this.size}/${String(i).padStart(3, '0')}.webp${rev}`
  }

  onProgress(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  start(concurrency = 6) {
    if (this.started) return
    this.started = true
    const queue = strideOrder(this.count)
    const firstPass = new Set(queue.slice(0, this.firstPass))
    const next = async () => {
      while (queue.length && !this.disposed) {
        const i = queue.shift()
        try {
          const res = await fetch(this.url(i))
          if (!res.ok) throw new Error(String(res.status))
          this.blobs[i] = await res.blob()
          this.ready += 1
          // a primeira passada já sai decodificada: é o que aparece na abertura
          if (firstPass.has(i)) await this.want(i)
        } catch {
          /* quadro que falhou fica de fora; o vizinho mais próximo cobre */
        }
        if (this.disposed) return
        this.settled += 1
        this.listeners.forEach((fn) => fn(this))
      }
    }
    for (let k = 0; k < concurrency; k += 1) next()
  }

  want(i) {
    const blob = this.blobs[i]
    if (!blob || this.bitmaps.has(i) || this.decoding.has(i) || this.disposed) return undefined
    this.decoding.add(i)
    return decode(blob)
      .then((bmp) => {
        this.decoding.delete(i)
        if (this.disposed) {
          bmp.close?.()
          return
        }
        this.bitmaps.set(i, bmp)
        this.evict(this.budget)
      })
      .catch(() => this.decoding.delete(i))
  }

  evict(limit) {
    while (this.bitmaps.size > limit) {
      const [oldest, bmp] = this.bitmaps.entries().next().value
      this.bitmaps.delete(oldest)
      bmp.close?.()
    }
  }

  // Giro fora da tela: libera quase tudo e guarda só os mais recentes.
  trim(keep = 8) {
    this.evict(keep)
  }

  // Prepara os próximos quadros no sentido do giro (dir 1 ou -1; 0 = parado,
  // prepara dos dois lados), andando de `stride` em `stride`.
  prefetch(i, dir, stride = 1) {
    const n = this.count
    this.want(mod(i, n))
    const way = dir || 1
    const back = dir ? BEHIND : AHEAD / 2
    for (let k = 1; k <= AHEAD; k += 1) this.want(mod(i + way * k * stride, n))
    for (let k = 1; k <= back; k += 1) this.want(mod(i - way * k * stride, n))
  }

  // Quadro i se já estiver decodificado (renova no LRU); senão, null.
  get(i) {
    const k = mod(Math.round(i), this.count)
    const hit = this.bitmaps.get(k)
    if (!hit) return null
    this.bitmaps.delete(k)
    this.bitmaps.set(k, hit)
    return hit
  }

  // O quadro decodificado mais perto de i. No empate fica o de trás (de onde
  // o giro está vindo): o tênis segura meio instante em vez de pular à frente.
  nearest(i, dir = 0) {
    const n = this.count
    const at = mod(Math.round(i), n)
    let best = null
    let bestDist = Infinity
    for (const [k, bmp] of this.bitmaps) {
      const d = frameDelta(at, k, n)
      const dist = Math.abs(d) + (dir && Math.sign(d) === dir ? 0.5 : 0)
      if (dist < bestDist) {
        bestDist = dist
        best = bmp
      }
    }
    return best
  }

  // Giro sozinho: o quadro inteiro i (ou o mais perto, se ainda não chegou).
  exact(i, dir = 1) {
    this.prefetch(mod(Math.round(i), this.count), dir, 1)
    return this.get(i) ?? this.nearest(i, dir)
  }

  // O que desenhar na posição `index` (fracionária, em quadros) andando
  // `speed` quadros desde o último desenho: os dois vizinhos e quanto
  // misturar (pair identifica o par, para o Settle). Rápido: um quadro
  // inteiro de `stride` em `stride`, sem mistura.
  view(index, speed = 0) {
    const n = this.count
    const f = mod(index, n)
    const dir = Math.sign(speed)
    if (Math.abs(speed) > FAST) return { a: this.frameFor(index, speed), b: null, t: 0, pair: -1 }
    const i0 = Math.floor(f)
    const i1 = mod(i0 + 1, n)
    this.prefetch(dir < 0 ? i1 : i0, dir, 1)
    const a = this.bitmaps.get(i0)
    const b = this.bitmaps.get(i1)
    if (a && b) {
      this.get(i0)
      this.get(i1)
      return { a, b, t: f - i0, pair: i0 }
    }
    const k = Math.round(f)
    return { a: this.get(k) ?? this.nearest(k, dir), b: null, t: 0, pair: -1 }
  }

  // O quadro inteiro para a posição `index` andando `speed` quadros desde o
  // último desenho. Rápido: um de `stride` em `stride` (só esses são
  // decodificados).
  frameFor(index, speed = 0) {
    const n = this.count
    const f = mod(index, n)
    const v = Math.abs(speed)
    const dir = Math.sign(speed)
    const stride = v > 10 ? 8 : v > 5 ? 4 : v > FAST ? 2 : 1
    const k = mod(Math.round(f / stride) * stride, n)
    this.prefetch(k, dir, stride)
    return this.get(k) ?? this.nearest(k, dir)
  }

  dispose() {
    this.disposed = true
    this.bitmaps.forEach((bmp) => bmp.close?.())
    this.bitmaps.clear()
    this.blobs.fill(null)
    this.listeners.clear()
  }
}

// Giro mostrado em mais de um lugar ao mesmo tempo (a órbita e o par da
// semana mostram o mesmo tênis): uma sequência só, com os quadros baixados e
// decodificados uma vez. Cada um que usa chama release() ao sair.
const shared = new Map()

export function acquireSequence(id, manifest, size) {
  const key = `${id}/${size}/${manifest.rev || ''}`
  let entry = shared.get(key)
  if (!entry) {
    entry = { seq: new FrameSequence(id, manifest, size), users: 0 }
    shared.set(key, entry)
  }
  entry.users += 1
  let released = false
  return {
    seq: entry.seq,
    release: () => {
      if (released) return
      released = true
      entry.users -= 1
      if (entry.users <= 0) {
        entry.seq.dispose()
        shared.delete(key)
      }
    },
  }
}

// Desenha um quadro no canvas com "contain", nítido em telas de alta densidade.
export class SpinCanvas {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true })
    this.last = null
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.resize()
  }

  resize() {
    // tamanho de layout, sem os transforms (a caixa do giro abre em escala
    // 0,64): medido com a escala, o canvas ficava pequeno e embaçava ao crescer
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.last = null
      this.lastB = null
    }
  }

  // Um quadro inteiro, com "contain".
  draw(img) {
    this.blend(img, null, 0)
  }

  // Dois quadros vizinhos misturados (soma premultiplicada: cor e
  // transparência somam certo). Só redesenha quando algo mudou.
  blend(a, b, t) {
    if (!a) return
    const step = b ? Math.round(t * 32) / 32 : 0
    const one = !b || step <= 0 ? a : step >= 1 ? b : null
    if (one ? one === this.last && !this.lastB : a === this.last && b === this.lastB && step === this.lastT) return
    const iw = a.naturalWidth || a.width
    const ih = a.naturalHeight || a.height
    if (!iw || !ih) return
    const { width: cw, height: ch } = this.canvas
    const scale = Math.min(cw / iw, ch / ih)
    const w = iw * scale
    const h = ih * scale
    const x = (cw - w) / 2
    const y = (ch - h) / 2
    const ctx = this.ctx
    ctx.clearRect(0, 0, cw, ch)
    ctx.imageSmoothingQuality = 'high'
    if (one) {
      ctx.drawImage(one, x, y, w, h)
      this.last = one
      this.lastB = null
      return
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 1 - step
    ctx.drawImage(a, x, y, w, h)
    ctx.globalAlpha = step
    ctx.drawImage(b, x, y, w, h)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    this.last = a
    this.lastB = b
    this.lastT = step
  }
}
