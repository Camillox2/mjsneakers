import { Fragment } from 'react'
import styles from './Markdown.module.css'

// Markdown simples dos textos legais (GET /legal): # e ## (títulos), "- "
// (lista), **negrito** e parágrafos separados por linha em branco.
// Tudo vira elemento React; o texto nunca entra como HTML, então nada que
// venha do admin consegue injetar código na página.

// **negrito** dentro de uma linha
function inline(text, keyBase) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>
  })
}

export function parseMarkdown(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  let list = null

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list?.length) blocks.push({ type: 'ul', items: list })
    list = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: heading[1].length === 1 ? 'h2' : 'h3', text: heading[2] })
      continue
    }
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (item) {
      flushParagraph()
      if (!list) list = []
      list.push(item[1])
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}

// Os títulos do texto viram h2/h3: o h1 é o da página.
export default function Markdown({ source, className = '' }) {
  const blocks = parseMarkdown(source)
  return (
    <div className={`${styles.md} ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'h2') return <h2 key={i}>{inline(b.text, i)}</h2>
        if (b.type === 'h3') return <h3 key={i}>{inline(b.text, i)}</h3>
        if (b.type === 'ul') {
          return (
            <ul key={i}>
              {b.items.map((it, k) => <li key={k}>{inline(it, `${i}-${k}`)}</li>)}
            </ul>
          )
        }
        return <p key={i}>{inline(b.text, i)}</p>
      })}
    </div>
  )
}
