import { useEffect, useRef } from 'react'
import styles from './CodeInput.module.css'

// Código de 6 dígitos (e-mail). Um campo só, grande e espaçado: aceita colar
// o código inteiro, o preenchimento automático do celular (one-time-code) e
// o teclado numérico. Completo, chama onComplete.
export default function CodeInput({ value, onChange, onComplete, id, disabled = false, invalid = false, autoFocus = true, label = 'Código de 6 dígitos' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])

  return (
    <input
      ref={ref}
      id={id}
      className={`${styles.code} ${invalid ? styles.invalid : ''}`}
      value={value}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(next)
        if (next.length === 6) onComplete?.(next)
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="000000"
      enterKeyHint="done"
      aria-label={label}
      aria-invalid={invalid || undefined}
      disabled={disabled}
    />
  )
}
