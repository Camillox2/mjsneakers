import { Component } from 'react'
import { reportError } from '../../lib/errorReporter'

// Se algo quebrar ao desenhar a página, mostra um aviso com saída em vez de
// deixar a tela preta (sem isso o React desmonta tudo e sobra só o fundo).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    // vai para o servidor já limpo (sem e-mail, token nem querystring)
    const err = error instanceof Error ? error : new Error(String(error))
    if (info?.componentStack) err.stack = `${err.stack || err.message}\n--- componentes ---${info.componentStack}`
    reportError(err, 'render')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        style={{
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#000',
          color: '#f2f3f5',
          fontFamily: 'Archivo, system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ fontFamily: '"Noto Serif Display", Georgia, serif', fontStyle: 'italic', fontSize: '1.75rem', marginBottom: 8 }}>
            A vitrine travou.
          </p>
          <p style={{ color: '#a9aeb7', marginBottom: 20 }}>Recarregue a página para voltar à loja.</p>
          <button type="button" className="pz-btn" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}
