import { motion } from 'framer-motion'

// Traço que se desenha: as ilustrações do painel entram como um croqui.
function Line({ d, delay = 0, duration = 0.9, width = 1.6, stroke = 'currentColor', opacity = 1 }) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{ pathLength: { duration, delay, ease: [0.65, 0, 0.35, 1] }, opacity: { duration: 0.2, delay } }}
    />
  )
}

/* Tênis de perfil, bico para a direita. Traço genérico (sem logo de marca). */
export function SneakerSketch({ className, stroke = 'currentColor' }) {
  const paths = [
    // cabedal
    'M44 140 C40 118 42 96 54 84 C70 80 92 86 112 94 C124 98 134 94 142 80 C148 70 160 66 168 72 C190 88 222 104 262 116 C300 126 340 128 360 136 C370 140 374 146 372 150',
    // entressola
    'M40 146 C150 141 300 145 374 150',
    // solado
    'M40 146 C36 158 44 166 60 166 L352 166 C370 166 378 158 374 150',
    // puxador do calcanhar
    'M54 84 L50 70 C49 64 56 62 60 66 L66 82',
    // painel lateral
    'M92 131 C150 128 208 118 256 117',
    // biqueira
    'M296 127 C318 131 342 137 361 146',
    // cadarço
    'M176 82 L186 73', 'M196 92 L206 83', 'M216 100 L226 91', 'M236 107 L246 98',
    // ranhuras do solado
    'M90 166 L90 160', 'M140 166 L140 160', 'M190 166 L190 160', 'M240 166 L240 160', 'M290 166 L290 160',
  ]
  return (
    <svg className={className} viewBox="20 50 370 130" aria-hidden="true">
      {paths.map((d, i) => (
        <Line key={i} d={d} stroke={stroke} delay={i < 3 ? i * 0.35 : 1 + i * 0.06} duration={i < 3 ? 1.3 : 0.5} width={i < 3 ? 2 : 1.4} />
      ))}
    </svg>
  )
}

export function ShoeBox() {
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      <Line d="M22 44 L110 44 L110 84 L22 84 Z" />
      <Line d="M16 34 L104 22 L116 36 L28 48 Z" delay={0.35} />
      <Line d="M40 58 L92 58" delay={0.7} width={1.2} opacity={0.6} />
      <Line d="M40 66 L76 66" delay={0.8} width={1.2} opacity={0.6} />
      <Line d="M102 12 L106 4 M110 16 L118 12 M96 16 L90 10" delay={1} width={1.2} />
    </svg>
  )
}

export function EmptyRun() {
  const xs = [14, 34, 54, 74, 94]
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      {xs.map((x, i) => (
        <Line key={x} d={`M${x} 34 L${x + 16} 34 L${x + 16} 70 L${x} 70 Z`} delay={i * 0.12} duration={0.6} />
      ))}
      <Line d="M10 80 L122 80" delay={0.7} width={1.2} opacity={0.5} />
      <Line d="M58 46 L66 58 M66 46 L58 58" delay={1} width={1.8} />
    </svg>
  )
}

export function Envelope() {
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      <Line d="M24 30 L108 30 L108 80 L24 80 Z" />
      <Line d="M24 30 L66 58 L108 30" delay={0.4} />
      <Line d="M24 80 L54 54 M108 80 L78 54" delay={0.7} width={1.2} opacity={0.6} />
      <Line d="M96 18 C104 10 116 10 122 16" delay={1} width={1.2} />
    </svg>
  )
}

export function Receipt() {
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      <Line d="M38 10 L94 10 L94 86 L87 81 L80 86 L73 81 L66 86 L59 81 L52 86 L45 81 L38 86 Z" duration={1.1} />
      <Line d="M48 28 L84 28" delay={0.6} width={1.2} opacity={0.6} />
      <Line d="M48 40 L78 40" delay={0.7} width={1.2} opacity={0.6} />
      <Line d="M48 52 L84 52" delay={0.8} width={1.2} opacity={0.6} />
      <Line d="M66 66 L84 66" delay={0.95} width={2} />
    </svg>
  )
}

export function ChartSketch() {
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      <Line d="M16 82 L118 82" width={1.2} opacity={0.5} />
      <Line d="M18 70 C34 66 40 50 56 54 C70 58 76 36 92 34 C102 33 108 24 116 18" delay={0.3} duration={1.2} />
      <Line d="M110 16 L118 17 L116 25" delay={1.3} duration={0.3} />
    </svg>
  )
}

export function Stars() {
  const pts = [[24, 30], [48, 18], [70, 38], [94, 22], [110, 52], [36, 60], [82, 66]]
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      {pts.map(([x, y], i) => (
        <Line key={i} d={`M${x - 4} ${y} L${x + 4} ${y} M${x} ${y - 4} L${x} ${y + 4}`} delay={i * 0.1} duration={0.35} width={1.4} />
      ))}
      <Line d="M18 88 L64 72" delay={0.8} width={1.2} opacity={0.6} />
      <Line d="M64 72 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0" delay={1.1} duration={0.3} />
    </svg>
  )
}

export function Tag() {
  return (
    <svg viewBox="0 0 132 96" width="100%" height="100%" aria-hidden="true">
      <Line d="M30 26 L78 26 L106 50 L78 74 L30 74 Z" duration={1} />
      <Line d="M44 50 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0" delay={0.7} duration={0.4} />
      <Line d="M58 44 L84 44 M58 56 L76 56" delay={0.9} width={1.2} opacity={0.6} />
    </svg>
  )
}
