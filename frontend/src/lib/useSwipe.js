import { useRef } from 'react'

// Deslizar o dedo para trocar de foto ou de banner. Devolve as props de
// arrasto do framer-motion para espalhar num motion.* (o framer já põe
// touch-action: pan-y, então a rolagem da página continua livre) e um
// `justDragged()` para ignorar o clique que alguns navegadores disparam no fim
// do arrasto.
export function useSwipe({ onPrev, onNext, enabled = true, threshold = 56 }) {
  const lastDrag = useRef(0)

  const bind = enabled
    ? {
        drag: 'x',
        dragSnapToOrigin: true,
        dragElastic: 0.22,
        dragMomentum: false,
        dragDirectionLock: true,
        onDragStart: () => {
          lastDrag.current = performance.now()
        },
        onDragEnd: (_, { offset, velocity }) => {
          lastDrag.current = performance.now()
          if (offset.x < -threshold || velocity.x < -520) onNext?.()
          else if (offset.x > threshold || velocity.x > 520) onPrev?.()
        },
      }
    : {}

  return { bind, justDragged: () => performance.now() - lastDrag.current < 320 }
}
