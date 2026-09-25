import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import s from './charts.module.css'

export function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [ref])
  return width
}

// Escala com números redondos: 0, 500, 1.000, 1.500...
export function niceScale(max, count = 4) {
  const raw = Math.max(max, 1) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= raw) || 10 * mag
  const top = step * Math.ceil(Math.max(max, 1) / step)
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { ticks, top }
}

/* Série diária com o período anterior de fundo, em cinza, no mesmo eixo.
   A mira acha o dia mais perto do dedo; a dica lista as duas séries. */
export function LineChart({ data, prev, height = 240, format, tickFormat, dateFormat, name = 'Este período', prevName = 'Período anterior', label }) {
  const ref = useRef(null)
  const width = useWidth(ref)
  const [hover, setHover] = useState(null)

  const n = data.length
  const pad = { l: 52, r: 14, t: 10, b: 28 }
  const w = Math.max(10, width - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const values = data.map(d => Number(d.value) || 0)
  const prevValues = (prev || []).map(d => Number(d.value) || 0)
  const { ticks, top } = niceScale(Math.max(0, ...values, ...prevValues))
  const x = (i) => pad.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v) => pad.t + h - (v / top) * h

  const linePath = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const mainPath = linePath(values)
  const areaPath = n ? `${mainPath} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : ''
  const prevPath = prevValues.length === n ? linePath(prevValues) : null

  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 70))))
  const xTicks = data.map((d, i) => ({ i, d })).filter(({ i }) => i % every === 0 || i === n - 1)
    .filter(({ i }, k, arr) => !(k === arr.length - 2 && n - 1 - i < every / 2 && arr[arr.length - 1].i === n - 1))

  const pick = (clientX) => {
    const rect = ref.current.getBoundingClientRect()
    const px = clientX - rect.left
    const i = Math.round(((px - pad.l) / w) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setHover(i => Math.min(n - 1, (i ?? -1) + 1)) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover(i => Math.max(0, (i ?? n) - 1)) }
  }

  const tipLeft = hover == null ? 0 : x(hover) > width - 190 ? x(hover) - 178 : x(hover) + 12
  const animKey = `${n}-${data[0]?.date}-${data[n - 1]?.date}`

  return (
    <div>
      <div className={s.legend} aria-hidden="true">
        <span className={s.legendItem}><span className={s.legendLine} style={{ background: 'var(--a-series-1)' }} />{name}</span>
        {prevPath && <span className={s.legendItem}><span className={s.legendLine} style={{ background: 'var(--a-series-prev)' }} />{prevName}</span>}
      </div>
      <div
        ref={ref}
        className={s.chart}
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        onPointerMove={e => n && pick(e.clientX)}
        onPointerDown={e => n && pick(e.clientX)}
        onPointerLeave={e => e.pointerType === 'mouse' && setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height}>
            {ticks.map(t => (
              <g key={t}>
                <line className={t === 0 ? s.axis : s.grid} x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
                <text className={s.tick} x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{tickFormat ? tickFormat(t) : t}</text>
              </g>
            ))}
            {xTicks.map(({ i, d }) => (
              <text key={i} className={s.tick} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {dateFormat ? dateFormat(d.date) : d.date}
              </text>
            ))}
            {prevPath && <path d={prevPath} fill="none" stroke="var(--a-series-prev)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            <motion.path key={`a-${animKey}`} d={areaPath} fill="var(--a-series-1)" initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ duration: 0.6, delay: 0.3 }} />
            <motion.path
              key={`l-${animKey}`}
              d={mainPath}
              fill="none"
              stroke="var(--a-series-1)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: [0.65, 0, 0.35, 1] }}
            />
            {n > 0 && hover == null && (
              <circle cx={x(n - 1)} cy={y(values[n - 1])} r="4" fill="var(--a-series-1)" stroke="var(--a-surface)" strokeWidth="2" />
            )}
            {hover != null && (
              <g>
                <line className={s.cross} x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} />
                {prevPath && <circle cx={x(hover)} cy={y(prevValues[hover])} r="4" fill="var(--a-series-prev)" stroke="var(--a-surface)" strokeWidth="2" />}
                <circle cx={x(hover)} cy={y(values[hover])} r="4.5" fill="var(--a-series-1)" stroke="var(--a-surface)" strokeWidth="2" />
              </g>
            )}
          </svg>
        )}
        {hover != null && data[hover] && (
          <div className={s.tip} style={{ left: tipLeft, top: 8 }}>
            <div className={s.tipTitle}>{dateFormat ? dateFormat(data[hover].date, true) : data[hover].date}</div>
            <div className={s.tipRow}>
              <span className={s.tipKey} style={{ background: 'var(--a-series-1)' }} />
              <span className={s.tipValue}>{format ? format(values[hover]) : values[hover]}</span>
              <span className={s.tipName}>{data[hover].extra}</span>
            </div>
            {prevPath && (
              <div className={s.tipRow}>
                <span className={s.tipKey} style={{ background: 'var(--a-series-prev)' }} />
                <span className={s.tipValue}>{format ? format(prevValues[hover]) : prevValues[hover]}</span>
                <span className={s.tipName}>antes</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Os mesmos números em tabela (quem não vê o gráfico não perde nada).
export function NumbersTable({ summary = 'Ver os números', head, rows }) {
  return (
    <details className={s.numbers}>
      <summary>{summary}</summary>
      <div className={s.numbersScroll}>
        <table>
          <thead><tr>{head.map(hd => <th key={hd}>{hd}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function Sparkline({ values = [], highlightLast = true }) {
  const n = values.length
  if (n < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [(i / (n - 1)) * 100, 30 - (v / max) * 26])
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`).join(' ')
  // o trecho mais recente vai na cor de destaque; o resto fica recuado
  const tail = pts.slice(Math.max(0, n - Math.max(2, Math.ceil(n / 5))))
  const dTail = tail.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`).join(' ')
  return (
    <svg className={s.spark} viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--a-series-prev)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {highlightLast && <path d={dTail} fill="none" stroke="var(--a-series-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  )
}
