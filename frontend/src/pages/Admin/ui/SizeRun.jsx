import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiPlus } from 'react-icons/fi'
import { Button } from './controls'
import s from './ui.module.css'

const cx = (...c) => c.filter(Boolean).join(' ')

export const sortSizes = (list) =>
  [...list].sort((a, b) => {
    const na = parseFloat(String(a.size).replace(',', '.'))
    const nb = parseFloat(String(b.size).replace(',', '.'))
    if (isNaN(na) || isNaN(nb)) return String(a.size).localeCompare(String(b.size))
    return na - nb
  })

export const LOW_AT = 2

const levelOf = (stock, low = LOW_AT) => (stock <= 0 ? 'out' : stock <= low ? 'low' : 'ok')

export function describeRun(sizes) {
  if (!sizes?.length) return 'Sem tamanhos cadastrados'
  return sortSizes(sizes).map(x => `${x.size}: ${Number(x.stock) > 0 ? `${x.stock}` : 'esgotado'}`).join(', ')
}

/* Grade de numeração: uma caixinha por tamanho, enchendo conforme o estoque.
   Esgotado leva um X, pouco estoque fica âmbar. O número vai junto (nunca só a cor). */
export function SizeRun({ sizes = [], compact, max = 10, low = LOW_AT, animate = true }) {
  const list = sortSizes(sizes)
  if (!list.length) return <span className={s.reserved}>Sem grade</span>
  return (
    <div className={cx(s.run, compact && s.runCompact)} role="img" aria-label={`Grade: ${describeRun(list)}`}>
      {list.map((x, i) => {
        const stock = Math.max(0, Number(x.stock) || 0)
        const level = levelOf(stock, low)
        const h = stock <= 0 ? 0 : Math.max(0.12, Math.min(1, stock / max))
        return (
          <div key={x.size} className={cx(s.runCell, level === 'low' && s.runLow, level === 'out' && s.runOut)} title={`${x.size}: ${stock > 0 ? `${stock} em estoque` : 'esgotado'}${x.reserved ? `, ${x.reserved} na sacola de alguém` : ''}`}>
            {!compact && <span className={s.runQty}>{stock > 0 ? stock : '0'}</span>}
            <span className={s.runBox}>
              {h > 0 && (
                <motion.span
                  className={s.runFill}
                  style={{ height: `${h * 100}%` }}
                  initial={animate ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, delay: animate ? i * 0.025 : 0, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </span>
            <span className={s.runSize}>{x.size}</span>
          </div>
        )
      })}
    </div>
  )
}

const PRESETS = [
  { label: 'Masculino 38 a 44', sizes: ['38', '39', '40', '41', '42', '43', '44'] },
  { label: 'Feminino 34 a 39', sizes: ['34', '35', '36', '37', '38', '39'] },
  { label: 'Completa 34 a 45', sizes: ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
]

// Grade editável: um contador por tamanho, com atalhos para montar a grade inteira.
export function SizeRunEditor({ value = [], onChange, fixed }) {
  const [newSize, setNewSize] = useState('')
  const list = sortSizes(value)

  const set = (size, stock) => onChange(list.map(x => (x.size === size ? { ...x, stock: Math.max(0, Math.min(99999, stock)) } : x)))
  const remove = (size) => onChange(list.filter(x => x.size !== size))
  const add = (sizes) => {
    const have = new Set(list.map(x => String(x.size)))
    const extra = sizes.map(v => String(v).trim()).filter(v => v && !have.has(v)).map(size => ({ size, stock: 0 }))
    if (extra.length) onChange(sortSizes([...list, ...extra]))
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.length > 0 && (
        <div className={s.runEdit}>
          {list.map(x => {
            const stock = Number(x.stock) || 0
            const level = levelOf(stock)
            return (
              <div key={x.size} className={cx(s.runEditCell, level === 'low' && s.runLow, level === 'out' && s.runOut)}>
                <span className={s.runEditSize}>{x.size}</span>
                <div className={s.stepper}>
                  <button type="button" className={s.stepBtn} onClick={() => set(x.size, stock - 1)} aria-label={`Tirar um par do ${x.size}`}>−</button>
                  <input
                    className={s.stepInput}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={stock}
                    onChange={e => set(x.size, parseInt(e.target.value, 10) || 0)}
                    aria-label={`Pares no tamanho ${x.size}`}
                  />
                  <button type="button" className={s.stepBtn} onClick={() => set(x.size, stock + 1)} aria-label={`Somar um par no ${x.size}`}>+</button>
                </div>
                {x.reserved > 0 && <span className={s.reserved}>{x.reserved} em sacolas</span>}
                {!fixed && <button type="button" className={s.runRemove} onClick={() => remove(x.size)}>Tirar tamanho</button>}
              </div>
            )
          })}
        </div>
      )}
      {!fixed && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* div e não form: a grade vive dentro do formulário do produto */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className={s.stepInput}
            style={{ width: 92 }}
            value={newSize}
            onChange={e => setNewSize(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(newSize.split(/[,\s]+/)); setNewSize('') } }}
            placeholder="Ex.: 40"
            aria-label="Novo tamanho"
            maxLength={10}
            enterKeyHint="done"
          />
          <Button size="small" icon={<FiPlus />} disabled={!newSize.trim()} onClick={() => { add(newSize.split(/[,\s]+/)); setNewSize('') }}>Tamanho</Button>
        </div>
        {PRESETS.map(p => (
          <Button key={p.label} size="small" variant="ghost" onClick={() => add(p.sizes)}>{p.label}</Button>
        ))}
      </div>}
    </div>
  )
}

export function RunLegend() {
  return (
    <div className={s.legend}>
      <span className={s.legendItem}><span className={s.legendSwatch} style={{ background: 'var(--a-series-1)' }} />Em estoque</span>
      <span className={s.legendItem}><span className={s.legendSwatch} style={{ background: 'var(--a-warning)' }} />Até {LOW_AT} pares</span>
      <span className={s.legendItem}><span className={s.legendSwatch} style={{ background: 'var(--a-critical-wash)', boxShadow: 'inset 0 0 0 1px var(--a-critical)' }} />Esgotado</span>
    </div>
  )
}
