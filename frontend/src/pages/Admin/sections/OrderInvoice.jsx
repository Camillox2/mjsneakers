import { useEffect, useRef, useState } from 'react'
import { FiFileText, FiRefreshCw, FiDownload, FiXCircle, FiCopy, FiAlertTriangle } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { dateTime } from '../lib/format'
import { Button, Badge, Dialog, TextField, ErrorNote, useToast } from '../ui'
import o from './orders.module.css'

const STATUS = {
  processing: { label: 'Em análise na SEFAZ', tone: 'warning' },
  authorized: { label: 'Autorizada', tone: 'good' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  error: { label: 'Recusada', tone: 'critical' },
}
const PAID = ['confirmed', 'processing', 'shipped', 'delivered']
const DAY = 24 * 60 * 60 * 1000
// Nota em análise: confere sozinha algumas vezes, sem ninguém apertar botão.
const AUTO_CHECKS = 4
const AUTO_EVERY = 8000

// O servidor fala com o nome técnico entre parênteses: "CNPJ da empresa (legal_cnpj)".
const plain = (text) => String(text || '').replace(/\s*\([A-Za-z_]+\)/g, '').trim()

// Chave de acesso em blocos de 4, como na DANFE (fácil de conferir de olho).
const keyBlocks = (key) => String(key || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')

// CPF (11 dígitos) ou CNPJ (14 posições; desde 2026 o CNPJ pode ter letras).
const cleanDoc = (value) => String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
const docReady = (value) => {
  const v = cleanDoc(value)
  return /^\d{11}$/.test(v) || /^[0-9A-Z]{12}\d{2}$/.test(v)
}

// Mensagem de erro da emissão em português de quem usa a loja.
function emitError(err) {
  const code = err.data?.code
  if (code === 'fiscal_disabled') return 'A nota fiscal está desligada. Ligue em Configurações, Nota fiscal.'
  if (code === 'fiscal_token') return 'O emissor de nota ainda não foi ligado no servidor. Peça para quem cuida do servidor configurar o token do Focus NFe.'
  if (code === 'fiscal_config' && Array.isArray(err.data.missing)) return `Falta preencher em Configurações, Nota fiscal: ${err.data.missing.map(plain).join(', ')}.`
  if (code === 'fiscal_ncm') return String(err.message).replace(/ ou em fiscal_default_ncm\.?$/, ' ou defina o NCM padrão em Configurações, Nota fiscal.')
  if (code === 'order_not_paid') return 'A nota só sai depois que o pedido for pago ou confirmado.'
  return plain(err.message)
}

// Nota fiscal do pedido: emitir, acompanhar, baixar e cancelar.
export default function OrderInvoice({ orderId, orderStatus, paymentStatus }) {
  const toast = useToast()
  const config = useResource(() => api.get('/invoices/config').then(r => r.data).catch(() => null), [])
  const list = useResource(() => api.get(`/invoices/order/${orderId}`).then(r => asList(r.data)), [orderId])
  const [busy, setBusy] = useState('')
  const [cancel, setCancel] = useState(null)
  const [doc, setDoc] = useState(null) // CPF ou CNPJ pedido na hora (pedido pago fora do Mercado Pago)
  const checks = useRef({})

  const cfg = config.data
  const loaded = list.data !== undefined
  const invoices = list.data || []
  const waiting = invoices.find(i => i.status === 'processing')
  const reloadList = list.reload

  // Nota em análise: consulta a SEFAZ de novo sozinha, poucas vezes.
  useEffect(() => {
    if (!waiting) return undefined
    const done = checks.current[waiting.id] || 0
    if (done >= AUTO_CHECKS) return undefined
    const t = setTimeout(async () => {
      checks.current[waiting.id] = done + 1
      try { await api.post(`/invoices/${waiting.id}/sync`) } catch { checks.current[waiting.id] = AUTO_CHECKS }
      reloadList()
    }, AUTO_EVERY)
    return () => clearTimeout(t)
  }, [waiting, reloadList])

  // loja sem nota fiscal ligada e sem nota antiga: o bloco nem aparece
  if (!cfg?.enabled && !invoices.length) return null

  const active = invoices.find(i => i.status === 'authorized' || i.status === 'processing')
  const authorized = invoices.find(i => i.status === 'authorized')
  const blockedBy = orderStatus === 'cancelled'
    ? 'Pedido cancelado não recebe nota.'
    : ['refunded', 'charged_back'].includes(paymentStatus)
      ? 'O pagamento foi estornado ou contestado: não dá para emitir nota.'
      : !(paymentStatus === 'approved' || PAID.includes(orderStatus))
        ? 'A nota sai depois que o pedido for pago ou confirmado.'
        : ''

  const emit = async (document) => {
    if (busy) return
    setBusy('emit')
    try {
      // o documento vai só nesta chamada: o servidor não guarda
      const { data: inv } = await api.post(`/invoices/order/${orderId}`, document ? { cpf: cleanDoc(document) } : {})
      setDoc(null)
      if (inv?.status === 'authorized') toast.good('Nota emitida e autorizada. O cliente recebe a nota por e-mail.')
      else if (inv?.status === 'error') toast.error(`A SEFAZ recusou a nota. ${inv.error_message || ''}`.trim())
      else toast.good('Nota emitida. A SEFAZ ainda está analisando; a situação se atualiza sozinha em instantes.')
      list.reload()
    } catch (err) {
      const code = err.data?.code
      if (code === 'document_required' || code === 'document_invalid') {
        setDoc(d => ({ value: d?.value || '', error: code === 'document_invalid' ? 'Esse CPF ou CNPJ não confere. Confira os números.' : '' }))
      } else {
        if (code === 'invoice_exists') list.reload()
        toast.error(emitError(err))
      }
    } finally { setBusy('') }
  }

  const sync = async (inv) => {
    setBusy(`sync-${inv.id}`)
    try {
      const { data: fresh } = await api.post(`/invoices/${inv.id}/sync`)
      if (fresh?.status === 'processing') toast.info('A SEFAZ ainda está analisando. Confira de novo em alguns minutos.')
      else toast.good(`Situação conferida: ${(STATUS[fresh?.status]?.label || 'sem mudança').toLowerCase()}.`)
      list.reload()
    } catch (err) { toast.error(plain(err.message)) } finally { setBusy('') }
  }

  const doCancel = async (e) => {
    e?.preventDefault()
    if (busy || cancel.text.trim().length < 15) return
    setBusy('cancel')
    try {
      await api.post(`/invoices/${cancel.id}/cancel`, { justification: cancel.text.trim() })
      toast.good('Nota cancelada.')
      setCancel(null)
      list.reload()
    } catch (err) { toast.error(plain(err.message)) } finally { setBusy('') }
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.good('Chave copiada.') } catch { toast.error('Não deu para copiar. Selecione a chave e copie.') }
  }

  const cancelTarget = cancel && invoices.find(i => i.id === cancel.id)
  const cancelLate = cancelTarget && Date.now() - new Date(cancelTarget.created_at).getTime() > DAY

  return (
    <div className={o.block}>
      <h3 className={o.blockTitle}><FiFileText aria-hidden="true" /> Nota fiscal</h3>
      <ErrorNote error={list.error} onRetry={list.reload} />

      {orderStatus === 'cancelled' && authorized && (
        <p className={o.payAlert}><FiAlertTriangle aria-hidden="true" />O pedido foi cancelado, mas a nota continua valendo. Cancele a nota abaixo (a SEFAZ aceita até 24 horas depois da emissão) ou fale com o contador.</p>
      )}

      {invoices.length > 0 ? (
        <ul className={o.invoices}>
          {invoices.map(inv => {
            const st = STATUS[inv.status] || { label: 'Situação desconhecida', tone: 'neutral' }
            return (
              <li key={inv.id} className={o.invoice}>
                <div className={o.invoiceMain}>
                  <div className={o.invoiceTitle}>
                    {inv.number ? `NF-e nº ${inv.number}${inv.series ? `, série ${inv.series}` : ''}` : 'NF-e'}
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className={o.invoiceSub}>Emitida em {dateTime(inv.created_at)}</div>
                  {inv.access_key && (
                    <div className={o.invoiceKey}>
                      <span className={o.invoiceKeyText} aria-label={`Chave de acesso ${inv.access_key}`}>{keyBlocks(inv.access_key)}</span>
                      <Button size="small" variant="ghost" icon={<FiCopy />} aria-label="Copiar a chave de acesso" onClick={() => copy(inv.access_key)} />
                    </div>
                  )}
                  {inv.status === 'error' && inv.error_message && <p className={o.invoiceError}>{inv.error_message}</p>}
                  {inv.status === 'processing' && inv.error_message && <p className={o.invoiceSub}>{inv.error_message}</p>}
                </div>
                <div className={o.invoiceActions}>
                  {inv.danfe_url && <Button size="small" icon={<FiDownload />} onClick={() => window.open(inv.danfe_url, '_blank', 'noopener,noreferrer')}>Abrir a DANFE</Button>}
                  {inv.xml_url && <Button size="small" variant="ghost" icon={<FiDownload />} onClick={() => window.open(inv.xml_url, '_blank', 'noopener,noreferrer')}>XML</Button>}
                  {inv.status === 'processing' && <Button size="small" icon={<FiRefreshCw />} loading={busy === `sync-${inv.id}`} disabled={!!busy} onClick={() => sync(inv)}>Conferir na SEFAZ</Button>}
                  {inv.status === 'authorized' && <Button size="small" variant="danger" icon={<FiXCircle />} disabled={!!busy} onClick={() => setCancel({ id: inv.id, text: '' })}>Cancelar nota</Button>}
                </div>
              </li>
            )
          })}
        </ul>
      ) : loaded && (
        <p className={o.invoiceSub}>Nenhuma nota emitida para este pedido.</p>
      )}

      {cfg?.missing?.length > 0 && (
        <p className={o.invoiceSub}>Falta preencher em Configurações, Nota fiscal: {cfg.missing.map(plain).join(', ')}.</p>
      )}
      {cfg?.enabled && loaded && !active && !list.error && (
        <div className={o.contactLinks}>
          <Button icon={<FiFileText />} loading={busy === 'emit'} onClick={() => emit()} disabled={!!blockedBy || !cfg.has_token || cfg.missing?.length > 0 || (!!busy && busy !== 'emit')}>
            {invoices.some(i => i.status === 'error' || i.status === 'cancelled') ? 'Emitir de novo' : 'Emitir nota fiscal'}
          </Button>
          {blockedBy && <span className={o.invoiceSub}>{blockedBy}</span>}
          {!blockedBy && !cfg.has_token && <span className={o.invoiceSub}>O emissor de nota ainda não foi ligado no servidor.</span>}
        </div>
      )}

      <Dialog
        open={!!doc}
        onClose={() => setDoc(null)}
        size="s"
        title="CPF ou CNPJ de quem comprou"
        description="Este pedido não foi pago pelo Mercado Pago, então o documento precisa ser digitado. Ele vai só para a nota e não fica guardado na loja."
        footer={<>
          <Button variant="ghost" onClick={() => setDoc(null)}>Voltar</Button>
          <Button variant="primary" type="submit" form="nf-doc" loading={busy === 'emit'} disabled={!docReady(doc?.value)}>Emitir nota</Button>
        </>}
      >
        {doc && (
          <form id="nf-doc" onSubmit={e => { e.preventDefault(); if (docReady(doc.value)) emit(doc.value) }}>
            <TextField
              label="CPF ou CNPJ"
              value={doc.value}
              onChange={e => setDoc({ value: e.target.value.toUpperCase().replace(/[^0-9A-Z./-]/g, '').slice(0, 18), error: '' })}
              error={doc.error || undefined}
              hint="Pode digitar com ou sem pontos e traços."
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-autofocus
            />
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        size="s"
        title="Cancelar a nota fiscal?"
        description="A SEFAZ aceita cancelar até 24 horas depois da emissão, com uma justificativa. Não dá para desfazer."
        footer={<>
          <Button variant="ghost" onClick={() => setCancel(null)}>Voltar</Button>
          <Button variant="danger" type="submit" form="nf-cancel" loading={busy === 'cancel'} disabled={(cancel?.text || '').trim().length < 15}>Cancelar nota</Button>
        </>}
      >
        {cancel && (
          <form id="nf-cancel" onSubmit={doCancel} className={o.formGap}>
            {cancelLate && (
              <p className={o.payAlert}><FiAlertTriangle aria-hidden="true" />Esta nota foi emitida há mais de 24 horas. A SEFAZ deve recusar o cancelamento; se recusar, fale com o contador.</p>
            )}
            <TextField
              label="Justificativa"
              multiline
              value={cancel.text}
              onChange={e => setCancel(c => ({ ...c, text: e.target.value }))}
              maxLength={255}
              placeholder="Ex.: pedido cancelado a pedido do cliente antes do envio"
              hint={`De 15 a 255 letras. Você escreveu ${cancel.text.trim().length}.`}
              data-autofocus
            />
          </form>
        )}
      </Dialog>
    </div>
  )
}
