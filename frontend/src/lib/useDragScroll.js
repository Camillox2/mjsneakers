import { useEffect } from 'react'

// Arrastar com o mouse uma fileira que rola de lado (marcas, categorias,
// vistos recentemente). No toque e no trackpad a rolagem nativa já funciona;
// com mouse comum a barra de rolagem fica escondida e não havia como passar
// para o lado. O clique que termina um arrasto não conta (não escolhe a marca
// sem querer).
export function useDragScroll(ref, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return undefined
    let start = null
    let moved = false

    const down = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      if (el.scrollWidth <= el.clientWidth + 1) return
      start = { x: e.clientX, left: el.scrollLeft, id: e.pointerId }
      moved = false
    }
    const move = (e) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      if (!moved) {
        if (Math.abs(dx) < 6) return
        moved = true
        el.setPointerCapture?.(e.pointerId)
        el.dataset.dragging = 'true'
      }
      el.scrollLeft = start.left - dx
    }
    const up = (e) => {
      if (!start || (e.pointerId != null && e.pointerId !== start.id)) return
      start = null
      delete el.dataset.dragging
      el.releasePointerCapture?.(e.pointerId)
    }
    const click = (e) => {
      if (!moved) return
      moved = false
      e.preventDefault()
      e.stopPropagation()
    }
    // a imagem/link arrastável do navegador roubaria o gesto
    const dragstart = (e) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    el.addEventListener('dragstart', dragstart)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('dragstart', dragstart)
    }
  }, [ref, enabled])
}
