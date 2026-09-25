import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { FiX, FiAlertTriangle, FiInfo } from 'react-icons/fi'
import { Button } from './controls'
import { useIsMobile } from '../lib/hooks'
import s from './ui.module.css'

const EASE = [0.22, 1, 0.36, 1]

/* ---------- Camada: tudo que flutua mora num nó dentro do .root do painel
   (os tokens de cor valem lá dentro) e fora do conteúdo animado. ---------- */

const LayerContext = createContext(null)

export function LayerProvider({ node, children }) {
  return <LayerContext.Provider value={node}>{children}</LayerContext.Provider>
}

function Portal({ children }) {
  const node = useContext(LayerContext)
  if (!node) return null
  return createPortal(children, node)
}

/* ---------- Pilha de camadas: Esc e o botão voltar fecham só a de cima ---------- */

const stack = []
let locks = 0

function lockPage(on) {
  locks = Math.max(0, locks + (on ? 1 : -1))
  document.documentElement.style.overflow = locks > 0 ? 'hidden' : ''
}

function useLayer(open, requestClose, routed) {
  const id = useId()
  const closeRef = useRef(requestClose)
  closeRef.current = requestClose

  useEffect(() => {
    if (!open) return undefined
    stack.push(id)
    lockPage(true)
    // Uma entrada no histórico: o voltar do Android fecha a camada em vez de sair do painel.
    // Camada que já é uma rota (detalhe do pedido) não precisa: o voltar troca a rota.
    if (!routed) window.history.pushState({ ...window.history.state, adminLayer: id }, '')
    let popped = routed
    const onPop = () => {
      if (routed || stack[stack.length - 1] !== id) return
      popped = true
      closeRef.current('back')
    }
    const onKey = (e) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) {
        e.stopPropagation()
        closeRef.current('escape')
      }
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      const i = stack.lastIndexOf(id)
      if (i >= 0) stack.splice(i, 1)
      lockPage(false)
      if (!popped && window.history.state?.adminLayer === id) window.history.back()
    }
  }, [open, id, routed])

  return id
}

function trapFocus(e, container) {
  if (e.key !== 'Tab' || !container) return
  const items = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

/* ---------- Diálogo: centro na tela grande, folha de baixo no celular ---------- */

export function Dialog({ open, onClose, title, description, children, footer, size = 'm', canClose, routed }) {
  const mobile = useIsMobile()
  const panelRef = useRef(null)
  const returnFocus = useRef(null)
  const drag = useDragControls()
  const titleId = useId()

  const layerId = useRef(null)
  // canClose(reason) pode perguntar "descartar alterações?" e devolver false.
  const request = useCallback(async (reason) => {
    if (canClose) {
      const ok = await canClose(reason)
      if (!ok) {
        // o voltar já tirou a entrada do histórico: devolve para o próximo voltar funcionar
        if (reason === 'back') window.history.pushState({ ...window.history.state, adminLayer: layerId.current }, '')
        return
      }
    }
    onClose()
  }, [canClose, onClose])

  layerId.current = useLayer(open, request, routed)

  useEffect(() => {
    if (!open) return undefined
    returnFocus.current = document.activeElement
    const t = setTimeout(() => {
      const el = panelRef.current
      if (!el) return
      const target = el.querySelector('[data-autofocus]') || el
      target.focus({ preventScroll: true })
    }, 60)
    return () => {
      clearTimeout(t)
      returnFocus.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  const sizeClass = size === 'l' ? s.dialogL : size === 's' ? s.dialogS : ''

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className={s.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => request('backdrop')}
            />
            <div className={s.dialogWrap} key="wrap">
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`${s.dialog} ${sizeClass}`}
                onKeyDown={e => trapFocus(e, panelRef.current)}
                initial={mobile ? { y: '100%' } : { opacity: 0, y: 14, scale: 0.98 }}
                animate={mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
                exit={mobile ? { y: '100%' } : { opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: mobile ? 0.34 : 0.24, ease: EASE }}
                drag={mobile ? 'y' : false}
                dragListener={false}
                dragControls={drag}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) request('drag') }}
              >
                <div onPointerDown={e => mobile && drag.start(e)} style={{ touchAction: mobile ? 'none' : undefined }}>
                  <span className={s.grabber} aria-hidden="true" />
                  <div className={s.dialogHead}>
                    <div className={s.dialogTitles}>
                      <h2 id={titleId} className={s.dialogTitle}>{title}</h2>
                      {description && <p className={s.dialogDesc}>{description}</p>}
                    </div>
                    <Button variant="ghost" icon={<FiX />} aria-label="Fechar" onClick={() => request('button')} />
                  </div>
                </div>
                <div className={s.dialogBody}>{children}</div>
                {footer && <div className={s.dialogFoot}>{footer}</div>}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  )
}

/* ---------- Confirmação ---------- */

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve
    setState(typeof opts === 'string' ? { title: opts } : opts)
  }), [])

  const finish = (value) => {
    resolver.current?.(value)
    resolver.current = null
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => finish(false)}
        size="s"
        title={state?.title || ''}
        description={state?.message}
        footer={
          <>
            <Button variant="ghost" onClick={() => finish(false)}>{state?.cancelLabel || 'Voltar'}</Button>
            <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => finish(true)} data-autofocus>
              {state?.confirmLabel || 'Confirmar'}
            </Button>
          </>
        }
      >
        {state?.details}
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)

/* ---------- Avisos ---------- */

const ToastContext = createContext(null)
let toastSeq = 0

function DrawnCheck() {
  // o sinal de feito se desenha em vez de só aparecer
  return (
    <svg className={s.toastIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="var(--a-good-wash)" />
      <motion.path
        d="M7 12.5l3.2 3.2L17 9"
        fill="none"
        stroke="var(--a-good)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
      />
    </svg>
  )
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const remove = useCallback((id) => setItems(list => list.filter(t => t.id !== id)), [])

  const push = useCallback((message, tone = 'good', ms = 3600) => {
    const id = ++toastSeq
    setItems(list => [...list.slice(-2), { id, message, tone }])
    if (ms) setTimeout(() => remove(id), ms)
  }, [remove])

  const api = useMemo(() => ({
    good: (m) => push(m, 'good'),
    error: (m) => push(m, 'critical', 6000),
    info: (m) => push(m, 'info'),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Portal>
        <div className={s.toasts} role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map(t => (
              <motion.div
                key={t.id}
                layout
                className={s.toast}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                {t.tone === 'good' ? <DrawnCheck /> : t.tone === 'critical'
                  ? <FiAlertTriangle className={s.toastIcon} style={{ color: 'var(--a-critical)' }} aria-hidden="true" />
                  : <FiInfo className={s.toastIcon} style={{ color: 'var(--a-series-1)' }} aria-hidden="true" />}
                <span className={s.toastMsg}>{t.message}</span>
                <Button variant="ghost" size="small" icon={<FiX />} aria-label="Fechar aviso" onClick={() => remove(t.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Portal>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
