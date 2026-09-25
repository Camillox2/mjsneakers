import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useWidth, niceScale } from './LineChart'
import s from './charts.module.css'

/* Colunas de uma medida por período (ex.: receita por mês). Rótulo só no
   maior e no último; o resto fica na dica e na tabela. */
export function ColumnChart({ data, format = (v) => v, tickFormat, height = 240, label }) {
  const ref = useRef(null)
  const width = useWidth(ref)
  const [hover, setHover] = useState(null)
  const pad = { l: 52, r: 8, t: 22, b: 28 }
  const n = data.length
  const w = Math.max(10, width - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const values = data.map(d => Number(d.value) || 0)
  const { ticks, top } = niceScale(Math.max(0, ...values))
  const slot = n ? w / n : w
  const bw = Math.min(24, slot * 0.62)
  const x = (i) => pad.l + slot * i + (slot - bw) / 2
  const y = (v) => pad.t + h - (v / top) * h
  const maxI = values.indexOf(Math.max(...values))
  const labelled = new Set([maxI, n - 1])
  const bar = (i) => {
    const v = values[i]
    const bh = Math.max(0, (v / top) * h)
    const r = Math.min(4, bw / 2, bh)
    const x0 = x(i), y0 = pad.t + h - bh
    // cantos arredondados só em cima; a base encosta reto no eixo
    return `M${x0} ${pad.t + h} L${x0} ${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} L${x0 + bw - r} ${y0} Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + r} L${x0 + bw} ${pad.t + h} Z`
  }

  return (
    <div ref={ref} className={s.chart} style={{ height }} role="img" aria-label={label}>
      {width > 0 && (
        <svg width={width} height={height}>
          {ticks.map(t => (
            <g key={t}>
              <line className={t === 0 ? s.axis : s.grid} x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text className={s.tick} x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{tickFormat ? tickFormat(t) : t}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${format(values[i])}`}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={h} fill="transparent" />
              <motion.path
                d={bar(i)}
                fill="var(--a-series-1)"
                opacity={hover == null || hover === i ? 1 : 0.55}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                style={{ transformOrigin: `0px ${pad.t + h}px`, transformBox: 'view-box' }}
                transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              />
              {labelled.has(i) && values[i] > 0 && hover == null && (
                <text className={s.tick} x={x(i) + bw / 2} y={y(values[i]) - 6} textAnchor="middle" style={{ fill: 'var(--a-text)', fontWeight: 700 }}>{tickFormat ? tickFormat(values[i]) : values[i]}</text>
              )}
              <text className={s.tick} x={x(i) + bw / 2} y={height - 8} textAnchor="middle">{d.label}</text>
            </g>
          ))}
        </svg>
      )}
      {hover != null && data[hover] && (
        <div className={s.tip} style={{ left: Math.min(Math.max(0, x(hover) - 60), Math.max(0, width - 170)), top: 0 }}>
          <div className={s.tipTitle}>{data[hover].long || data[hover].label}</div>
          <div className={s.tipRow}><span className={s.tipKey} style={{ background: 'var(--a-series-1)' }} /><span className={s.tipValue}>{format(values[hover])}</span></div>
          {data[hover].sub && <div className={s.tipRow}><span className={s.tipName}>{data[hover].sub}</span></div>}
        </div>
      )}
    </div>
  )
}

/* Barras horizontais de uma medida só: uma cor para todas, o valor escrito
   na ponta. items: [{ key, label, value, sub, image }] */
export function BarList({ items, format = (v) => v, ranked, max: forcedMax }) {
  const max = forcedMax || Math.max(1, ...items.map(i => Number(i.value) || 0))
  return (
    <div className={s.bars}>
      {items.map((it, i) => {
        const v = Number(it.value) || 0
        return (
          <div key={it.key ?? it.label} className={s.bar}>
            <span className={s.barLabel}>
              {ranked && <span className={s.barRank}>{i + 1}</span>}
              {it.image !== undefined && <img className={s.barThumb} src={it.image} alt="" loading="lazy" />}
              <span className={s.barLabelText} title={it.label}>{it.label}</span>
              {it.sub && <span className={s.barSub}>{it.sub}</span>}
            </span>
            <span className={s.barValue}>{format(v)}</span>
            <span className={s.barTrack} aria-hidden="true">
              <motion.span
                className={s.barFill}
                style={{ width: `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
// Rampa de um tom só (azul), validada: mais claro = menos no tema claro;
// no escuro a rampa se inverte para "mais aceso = mais pedidos".
const RAMP_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']
const RAMP_DARK = ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6']

/* Pedidos por dia da semana e hora. No celular as horas viram blocos de 2h. */
export function HeatGrid({ cells, dark }) {
  const ref = useRef(null)
  const width = useWidth(ref)
  const block = width && width < 520 ? 2 : 1
  const cols = 24 / block
  const grid = Array.from({ length: 7 }, () => Array(cols).fill(0))
  cells.forEach(c => {
    const d = Number(c.weekday)
    const hIdx = Math.floor(Number(c.hour) / block)
    if (grid[d] && hIdx < cols) grid[d][hIdx] += Number(c.orders) || 0
  })
  const max = Math.max(1, ...grid.flat())
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const colorOf = (v) => (v <= 0 ? 'var(--a-sunken)' : ramp[Math.min(ramp.length - 1, Math.floor((v / max) * ramp.length - 1e-9))])
  const hourLabel = (i) => `${String(i * block).padStart(2, '0')}h`

  return (
    <div ref={ref}>
      <div className={s.heat} role="img" aria-label="Pedidos por dia da semana e hora. A tabela abaixo traz os números.">
        {grid.map((row, d) => (
          <div key={d} className={s.heatRow}>
            <span className={s.heatDay}>{DAYS[d]}</span>
            <div className={s.heatCells} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {row.map((v, h) => (
                <button
                  key={h}
                  type="button"
                  className={s.heatCell}
                  style={{ background: colorOf(v), boxShadow: v <= 0 ? 'inset 0 0 0 1px var(--a-line)' : undefined }}
                  title={`${DAY_NAMES[d]}, ${hourLabel(h)}${block > 1 ? ` a ${String((h + 1) * block).padStart(2, '0')}h` : ''}: ${v} ${v === 1 ? 'pedido' : 'pedidos'}`}
                  aria-label={`${DAY_NAMES[d]}, ${hourLabel(h)}: ${v} ${v === 1 ? 'pedido' : 'pedidos'}`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className={s.heatHours} aria-hidden="true">
          <span />
          <div className={s.heatHourCells}>
            {[0, 6, 12, 18, 23].map(hr => <span key={hr}>{String(hr).padStart(2, '0')}h</span>)}
          </div>
        </div>
      </div>
      <div className={s.scale} aria-hidden="true">
        <span>Menos</span>
        {ramp.map(c => <span key={c} className={s.scaleStep} style={{ background: c }} />)}
        <span>Mais pedidos</span>
      </div>
    </div>
  )
}
