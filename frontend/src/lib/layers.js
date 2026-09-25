import { useEffect, useRef } from 'react'

// "Voltar" do celular fecha a camada de cima (gaveta, modal, menu, folha) em
// vez de sair da página.
//
// Enquanto houver camada aberta, existe uma entrada a mais no histórico, com a
// mesma URL e o mesmo estado do roteador (ele nem percebe). O voltar consome
// essa entrada: a camada de cima fecha e, se ainda sobrar outra, a entrada é
// posta de novo. Fechar pelo X devolve a entrada com history.back().

const MARK = '__pzLayer'
const stack = [] // camadas abertas, a última é a de cima
let armed = false // a nossa entrada está no topo do histórico
let pendingBack = 0
let skipPops = 0
let listening = false

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', () => {
    // o voltar que nós mesmos pedimos ao fechar pelo X
    if (skipPops > 0) {
      skipPops -= 1
      return
    }
    if (!armed) {
      // entrada nossa que sobrou (navegou com uma camada aberta): pula
      if (history.state?.[MARK] && !stack.length) history.back()
      return
    }
    armed = false
    stack[stack.length - 1]?.close()
  })
}

function arm() {
  clearTimeout(pendingBack)
  pendingBack = 0
  if (armed) return
  history.pushState({ ...(history.state || {}), [MARK]: true }, '')
  armed = true
}

// Devolve a entrada um instante depois: se outra camada abrir junto (os
// favoritos fecham e a sacola abre), ela aproveita a mesma entrada.
function disarmSoon() {
  clearTimeout(pendingBack)
  pendingBack = setTimeout(() => {
    pendingBack = 0
    if (!armed || stack.length) return
    armed = false
    // se a pessoa navegou com a camada aberta, a entrada não está mais no topo
    if (history.state?.[MARK]) {
      skipPops += 1
      history.back()
    }
  }, 0)
}

export function useBackToClose(open, onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    listen()
    const layer = { close: () => closeRef.current?.() }
    stack.push(layer)
    arm()
    return () => {
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length) arm()
      else if (armed) disarmSoon()
    }
  }, [open])
}
