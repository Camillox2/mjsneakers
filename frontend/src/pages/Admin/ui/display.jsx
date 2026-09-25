import { useId } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiAlertTriangle, FiChevronLeft, FiChevronRight, FiRefreshCw } from 'react-icons/fi'
import { Button } from './controls'
import s from './ui.module.css'

const cx = (...c) => c.filter(Boolean).join(' ')

export function Badge({ tone = 'neutral', icon, children, title }) {
  return (
    <span className={cx(s.badge, s[tone])} title={title}>
      {icon}
      {children}
    </span>
  )
}

export function PageHeader({ title, description, actions }) {
  return (
    <header className={s.pageHead}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {description && <p className={s.pageDesc}>{description}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  )
}

export function Panel({ title, subtitle, actions, children, flush, className, style }) {
  return (
    <section className={cx(s.panel, className)} style={style}>
      {(title || actions) && (
        <div className={s.panelHead}>
          <h2 className={s.panelTitle}>
            {title}
            {subtitle && <> <span className={s.panelSub}>{subtitle}</span></>}
          </h2>
          {actions}
        </div>
      )}
      <div className={flush ? s.panelFlush : s.panelBody}>{children}</div>
    </section>
  )
}

export const Toolbar = ({ children }) => <div className={s.toolbar}>{children}</div>
export const Spacer = () => <span className={s.spacer} />

// Abas internas de uma seção (links, para o voltar do navegador funcionar).
export function SubNav({ items }) {
  const group = useId()
  return (
    <nav className={s.subnav} aria-label="Seções">
      {items.map(it => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx(s.subnavItem, isActive && s.subnavActive)}>
          {({ isActive }) => (
            <>
              {it.label}
              {it.count != null && <span className={s.count}>{it.count}</span>}
              {isActive && <motion.span layoutId={`sub-${group}`} className={s.subnavLine} transition={{ type: 'spring', stiffness: 480, damping: 40 }} />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function EmptyState({ art, title, children, action }) {
  return (
    <div className={s.empty}>
      {art && <div className={s.emptyArt}>{art}</div>}
      <p className={s.emptyTitle}>{title}</p>
      {children && <p className={s.emptyText}>{children}</p>}
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  )
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className={s.errorBox} role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <span className={s.errorText}>{error.message || String(error)}</span>
      {onRetry && <Button size="small" icon={<FiRefreshCw />} onClick={onRetry}>Tentar de novo</Button>}
    </div>
  )
}

export function Skeleton({ lines = 3, height = 14, gap = 12, widths }) {
  return (
    <div style={{ display: 'grid', gap }} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={s.skel} style={{ height, width: widths?.[i % widths.length] || '100%' }} />
      ))}
    </div>
  )
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null
  return (
    <nav className={s.pager} aria-label="Paginação">
      <Button size="small" icon={<FiChevronLeft />} aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)} />
      <span>Página {page} de {pages}</span>
      <Button size="small" icon={<FiChevronRight />} aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)} />
    </nav>
  )
}

/* Tabela no computador, lista de cartões no celular.
   columns: [{ key, header, render(row), align: 'right', primary, hideOnCard }] */
export function DataTable({ columns, rows, rowKey = 'id', onRowClick, selectable, selected = [], onSelect, dim, cardTop, empty }) {
  if (!rows.length && empty) return empty
  const keyOf = (r) => (typeof rowKey === 'function' ? rowKey(r) : r[rowKey])
  const allOn = selectable && rows.length > 0 && rows.every(r => selected.includes(keyOf(r)))
  const toggle = (k) => onSelect(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k])
  const primary = columns.find(c => c.primary) || columns[0]

  return (
    <div className={dim ? s.dim : undefined}>
      <div className={cx(s.tableWrap, s.responsive)}>
        <table className={s.table}>
          <thead>
            <tr>
              {selectable && (
                <th className={s.checkCell}>
                  <input
                    type="checkbox"
                    className={s.check}
                    aria-label="Selecionar todos desta página"
                    checked={allOn}
                    onChange={() => onSelect(allOn ? selected.filter(k => !rows.some(r => keyOf(r) === k)) : [...new Set([...selected, ...rows.map(keyOf)])])}
                  />
                </th>
              )}
              {columns.map(c => (
                <th key={c.key} className={c.align === 'right' ? s.num : undefined} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const k = keyOf(r)
              return (
                <tr
                  key={k}
                  className={cx(onRowClick && s.clickable, selected.includes(k) && s.selected)}
                  onClick={onRowClick ? (e) => { if (!e.target.closest('button, a, input, select, label')) onRowClick(r) } : undefined}
                >
                  {selectable && (
                    <td className={s.checkCell}>
                      <input type="checkbox" className={s.check} aria-label="Selecionar" checked={selected.includes(k)} onChange={() => toggle(k)} />
                    </td>
                  )}
                  {columns.map(c => (
                    <td key={c.key} className={c.align === 'right' ? s.num : undefined}>{c.render ? c.render(r) : r[c.key]}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={s.cards}>
        {rows.map(r => {
          const k = keyOf(r)
          return (
            <div
              key={k}
              className={cx(s.card, onRowClick && s.clickable, selected.includes(k) && s.selected)}
              onClick={onRowClick ? (e) => { if (!e.target.closest('button, a, input, select, label')) onRowClick(r) } : undefined}
            >
              <div className={s.cardTop}>
                {selectable && (
                  <input type="checkbox" className={s.check} aria-label="Selecionar" checked={selected.includes(k)} onChange={() => toggle(k)} />
                )}
                <div className={s.cardMain}>{cardTop ? cardTop(r) : primary.render ? primary.render(r) : r[primary.key]}</div>
              </div>
              {columns.filter(c => c !== primary && !c.hideOnCard).map(c => (
                <div key={c.key} className={s.cardRow}>
                  <span className={s.cardLabel}>{c.header}</span>
                  <span className={s.cardValue}>{c.render ? c.render(r) : r[c.key]}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
