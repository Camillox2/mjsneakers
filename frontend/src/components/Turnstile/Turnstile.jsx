import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSecurityConfig } from '../../services/security'
import styles from './Turnstile.module.css'

// Captcha da Cloudflare (Turnstile), reutilizável na loja e no admin.
//
//   const captcha = useTurnstile()
//   <Turnstile captcha={captcha} />
//   const token = await captcha.getToken()   // '' com o captcha desligado
//   api.post(url, body, captchaHeaders(token))
//
// Sem chave no GET /security/config, o captcha fica desligado: o componente
// não desenha nada e getToken() devolve ''. Ligado, o script só é baixado
// quando um formulário com captcha aparece. Modo "managed" com aparência
// "interaction-only": na maioria das vezes ninguém vê nada; quando a
// Cloudflare desconfia, o desafio aparece dentro do formulário.
//
// Cada token vale uma vez: depois de entregue, o widget já prepara o próximo.
// Token vencido (5 min) é renovado sozinho.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const WAIT_MS = 45000

let scriptPromise = null

function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem janela'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const fail = () => {
      scriptPromise = null
      reject(new Error('captcha indisponível'))
    }
    try {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.defer = true
      script.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : fail()), { once: true })
      script.addEventListener('error', () => {
        script.remove()
        fail()
      }, { once: true })
      document.head.appendChild(script)
    } catch {
      fail()
    }
  })
  return scriptPromise
}

export const CAPTCHA_FAILED = 'Não deu para confirmar que você é uma pessoa. Tente de novo em instantes.'

export function useTurnstile() {
  // undefined: ainda perguntando ao servidor; null: desligado
  const [siteKey, setSiteKey] = useState(undefined)
  const [interactive, setInteractive] = useState(false)
  const [failed, setFailed] = useState(false)
  const containerRef = useRef(null)
  const widgetRef = useRef(null)
  const tokenRef = useRef('')
  const waitersRef = useRef([]) // quem está esperando o próximo token
  const siteKeyRef = useRef(undefined)
  const configRef = useRef(null)

  const settle = (fn) => {
    const list = waitersRef.current
    waitersRef.current = []
    list.forEach(fn)
  }

  useEffect(() => {
    let alive = true
    configRef.current = loadSecurityConfig().then((cfg) => {
      const key = cfg?.turnstileSiteKey || null
      siteKeyRef.current = key
      if (alive) setSiteKey(key)
      return key
    })
    return () => {
      alive = false
    }
  }, [])

  const render = useCallback(async () => {
    const el = containerRef.current
    const key = siteKeyRef.current
    if (!el || !key || widgetRef.current != null) return
    try {
      const ts = await loadTurnstile()
      if (!containerRef.current || widgetRef.current != null) return
      widgetRef.current = ts.render(containerRef.current, {
        sitekey: key,
        theme: 'dark',
        language: 'pt-br',
        appearance: 'interaction-only',
        'refresh-expired': 'auto',
        callback: (token) => {
          setFailed(false)
          setInteractive(false)
          if (waitersRef.current.length) {
            // alguém já estava esperando: entrega e prepara o próximo
            settle((w) => w.resolve(token))
            queueMicrotask(() => {
              try { ts.reset(widgetRef.current) } catch { /* widget saiu */ }
            })
          } else {
            tokenRef.current = token
          }
        },
        'expired-callback': () => {
          tokenRef.current = ''
        },
        'error-callback': () => {
          tokenRef.current = ''
          setFailed(true)
          settle((w) => w.reject(new Error(CAPTCHA_FAILED)))
          return true // não deixa a Cloudflare jogar erro no console
        },
        'before-interactive-callback': () => setInteractive(true),
        'after-interactive-callback': () => setInteractive(false),
      })
    } catch {
      setFailed(true)
      settle((w) => w.reject(new Error(CAPTCHA_FAILED)))
    }
  }, [])

  // O container aparece e some com o formulário. Saiu da tela: o widget sai
  // junto (senão ficaria esperando token de um desafio que ninguém vê).
  const mount = useCallback((el) => {
    if (!el && widgetRef.current != null) {
      try { window.turnstile?.remove(widgetRef.current) } catch { /* já saiu */ }
      widgetRef.current = null
      tokenRef.current = ''
    }
    containerRef.current = el
    if (el) render()
  }, [render])

  useEffect(() => {
    if (siteKey) render()
  }, [siteKey, render])

  useEffect(() => () => {
    const id = widgetRef.current
    widgetRef.current = null
    if (id != null) {
      try { window.turnstile?.remove(id) } catch { /* já saiu */ }
    }
    settle((w) => w.reject(new Error(CAPTCHA_FAILED)))
  }, [])

  // Recomeça o desafio (depois de um erro 403 do captcha, por exemplo).
  const reset = useCallback(() => {
    tokenRef.current = ''
    setFailed(false)
    const id = widgetRef.current
    if (id != null) {
      try { window.turnstile?.reset(id) } catch { /* nada */ }
    } else {
      render()
    }
  }, [render])

  // Token para mandar no header X-Turnstile-Token ('' com o captcha desligado).
  const getToken = useCallback(async () => {
    const key = siteKeyRef.current === undefined ? await configRef.current : siteKeyRef.current
    if (!key) return ''
    if (tokenRef.current) {
      const token = tokenRef.current
      tokenRef.current = ''
      try { window.turnstile?.reset(widgetRef.current) } catch { /* nada */ }
      return token
    }
    if (widgetRef.current == null) render()
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject }
      waitersRef.current.push(waiter)
      setTimeout(() => {
        if (!waitersRef.current.includes(waiter)) return
        waitersRef.current = waitersRef.current.filter((w) => w !== waiter)
        reject(new Error(CAPTCHA_FAILED))
      }, WAIT_MS)
    })
  }, [render])

  return { enabled: Boolean(siteKey), loading: siteKey === undefined, interactive, failed, mount, getToken, reset }
}

// Lugar do desafio no formulário. Some quando o captcha está desligado e
// fica sem altura enquanto a Cloudflare não precisa de ninguém.
export default function Turnstile({ captcha, className = '' }) {
  if (!captcha?.enabled) return null
  return (
    <div className={`${styles.wrap} ${captcha.interactive ? styles.open : ''} ${className}`}>
      {captcha.interactive && <p className={styles.hint}>Confirme que você é uma pessoa para continuar.</p>}
      <div ref={captcha.mount} className={styles.box} />
    </div>
  )
}
