import { forwardRef, useId } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiSearch, FiX, FiAlertCircle } from 'react-icons/fi'
import s from './ui.module.css'

const cx = (...c) => c.filter(Boolean).join(' ')

export const Button = forwardRef(function Button(
  { variant = 'secondary', size, block, icon, loading, children, className, type = 'button', disabled, ...rest },
  ref
) {
  const iconOnly = !children && icon
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        s.btn,
        variant === 'primary' && s.primary,
        variant === 'ghost' && s.ghost,
        variant === 'danger' && s.danger,
        size === 'small' && s.small,
        block && s.block,
        iconOnly && s.iconOnly,
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={s.spinner} aria-hidden="true" /> : icon}
      {children}
    </button>
  )
})

// Link com cara de botão (nunca um <button> dentro de um <a>).
export function ButtonLink({ to, variant = 'secondary', size, icon, children, ...rest }) {
  const iconOnly = !children && icon
  return (
    <Link
      to={to}
      className={cx(s.btn, variant === 'primary' && s.primary, variant === 'ghost' && s.ghost, size === 'small' && s.small, iconOnly && s.iconOnly)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  )
}

export function Field({ label, hint, error, children, htmlFor, className }) {
  return (
    <div className={cx(s.field, className)}>
      {label && <label className={s.fieldLabel} htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? (
        <span className={s.fieldError} role="alert"><FiAlertCircle aria-hidden="true" />{error}</span>
      ) : hint ? (
        <span className={s.fieldHint}>{hint}</span>
      ) : null}
    </div>
  )
}

// Campo de texto com rótulo ligado automaticamente.
export function TextField({ label, hint, error, prefix, suffix, className, id, multiline, ...rest }) {
  const auto = useId()
  const fid = id || auto
  const control = multiline ? (
    <textarea id={fid} className={cx(s.textarea, error && s.invalid)} aria-invalid={!!error || undefined} {...rest} />
  ) : (
    <input id={fid} className={cx(s.input, error && s.invalid)} aria-invalid={!!error || undefined} {...rest} />
  )
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid} className={className}>
      {prefix || suffix ? (
        <div className={cx(s.affix, suffix && s.affixRight)}>
          <span className={s.affixText} aria-hidden="true">{prefix || suffix}</span>
          {control}
        </div>
      ) : control}
    </Field>
  )
}

export function SelectField({ label, hint, error, options, className, id, placeholder, ...rest }) {
  const auto = useId()
  const fid = id || auto
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid} className={className}>
      <select id={fid} className={cx(s.select, error && s.invalid)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

export function Select({ options, className, placeholder, ...rest }) {
  return (
    <select className={cx(s.select, className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Switch({ checked, onChange, label, description, disabled, hideLabel }) {
  return (
    <label className={s.switchRow} style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className={s.switchTrack} aria-hidden="true" />
      <span className={hideLabel ? s.srOnly : s.switchText}>
        <span>{label}</span>
        {description && <span className={s.switchDesc}>{description}</span>}
      </span>
    </label>
  )
}

// Grupo de opções exclusivas. A pílula desliza entre elas (layoutId único).
// Teclado como um grupo de rádio: Tab entra na opção marcada, setas trocam.
export function Segmented({ options, value, onChange, label }) {
  const group = useId()
  const current = Math.max(0, options.findIndex(o => o.value === value))
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    const jump = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null
    if (step === undefined && jump === null) return
    e.preventDefault()
    const next = jump ?? (current + step + options.length) % options.length
    onChange(options[next].value)
    e.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus()
  }
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === current ? 0 : -1}
            className={cx(s.segment, active && s.segmentActive)}
            onClick={() => onChange(o.value)}
          >
            {active && (
              <motion.span layoutId={`seg-${group}`} className={s.segmentPill} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            <span className={s.segmentLabel}>
              {o.label}
              {o.count != null && <span className={s.count}>{o.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SearchField({ value, onChange, placeholder = 'Buscar', label }) {
  return (
    <div className={s.search} role="search">
      <FiSearch aria-hidden="true" />
      <input
        type="search"
        className={s.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className={s.searchClear} onClick={() => onChange('')} aria-label="Limpar busca">
          <FiX aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export const Row = ({ children, style }) => <div className={s.row} style={style}>{children}</div>
export const Stack = ({ children, gap, style }) => <div className={s.stack} style={{ gap, ...style }}>{children}</div>
