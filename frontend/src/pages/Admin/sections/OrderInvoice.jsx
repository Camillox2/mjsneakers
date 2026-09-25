import { useState } from 'react'
import { FiFileText, FiRefreshCw, FiDownload, FiXCircle } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { dateTime } from '../lib/format'
import { Button, Badge, Dialog, TextField, useToast } from '../ui'
import o from './orders.module.css'
import s from './sections.module.css'

const STATUS = {
  processing: { label: 'Processando na SEFAZ', tone: 'warning' },
  authorized: { label: 'Autorizada', tone: 'good' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  error: { label: 'Recusada', tone: 'critical' },
}

// Nota fiscal do pedido: emitir, acompanhar, baixar e cancelar.
export default function OrderInvoice({ orderId, orderStatus, paymentStatus }) {
  const toast = useToast()
  const config = useResource(() => api.get('/invoices/config').then(r => r.data).catch(() => null), [])
  const list = useResource(() => api.get(`/invoices/order/${orderId}`).then(r => asList(r.data)).catch(() => []), [orderId])
  const [busy, setBusy] = useState('')
  const [cancel, setCancel] = useState(null)
  const [doc, setDoc] = useState(null) // CPF ou CNPJ pedido na hora (pedido pago fora do Mercado Pago)

  const cfg = config.data
  const invoices = list.data || []
  if (!cfg?.enabled && !invoices.length) return null

  const active = invoices.find(i => i.status === 'authorized' || i.status === 'processing')
  const payable = paymentStatus === 'approved' || ['confirmed', 'processing', 'shipped', 'delivered'].includes(orderStatus)

  const emit = async (document) => {
    setBusy('emit')
    try {
      // o documento vai só nesta chamada: o servidor não guarda
      await api.post(`/invoices/order/${orderId}`, document ? { cpf: document.replace(/\D/g, '') } : {})
      toast.good('Nota enviada para a SEFAZ. Em alguns segundos ela aparece como autorizada.')
      setDoc(null)
      list.reload()
    } catch (err) {
      if (err.data?.code === 'document_required' || err.data?.code === 'document_invalid') {
        setDoc(d => ({ value: d?.value || '', error: err.data.code === 'document_invalid' ? 'CPF ou CNPJ não confere.' : '' }))
      } else if (err.data?.code === 'fiscal_config' && Array.isArray(err.data.missing)) {
        toast.error(`Falta configurar a nota fiscal: ${err.data.missing.join(', ')}.`)
      } else {
        toast.error(err.message)
      }
    } finally { setBusy('') }
  }

  const sync = async (inv) => {
    setBusy(`sync-${inv.id}`)
    try { await api.post(`/invoices/${inv.id}/sync`); list.reload() } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const doCancel = async () => {
    setBusy('cancel')
    try {
      await api.post(`/invoices/${cancel.id}/cancel`, { justification: cancel.text.trim() })
      toast.good('Pedido de cancelamento enviado à SEFAZ.')
      setCancel(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  return (
    <div className={o.block}>
      <h3 className={o.blockTitle}><FiFileText aria-hidden="true" /> Nota fiscal</h3>
      {invoices.length > 0 ? (
        <div className={s.list}>
          {invoices.map(inv => (
            <div key={inv.id} className={s.listItem} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className={s.listMain} style={{ minWidth: 200 }}>
                <div className={s.listTitle}>{inv.number ? `NF-e ${inv.number}${inv.series ? `, série ${inv.series}` : ''}` : 'NF-e'}</div>
                <div className={s.listSub} style={{ whiteSpace: 'normal' }}>
                  {dateTime(inv.created_at)}{inv.access_key ? `, chave ${inv.access_key}` : ''}
                </div>
                {inv.status === 'error' && inv.error_message && <div className={s.small} style={{ whiteSpace: 'normal', marginTop: 4 }}>{inv.error_message}</div>}
              </div>
              <Badge tone={STATUS[inv.status]?.tone}>{STATUS[inv.status]?.label || inv.status}</Badge>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {inv.danfe_url && <Button size="small" icon={<FiDownload />} onClick={() => window.open(inv.danfe_url, '_blank', 'noopener')}>DANFE</Button>}
                {inv.xml_url && <Button size="small" variant="ghost" onClick={() => window.open(inv.xml_url, '_blank', 'noopener')}>XML</Button>}
                {inv.status === 'processing' && <Button size="small" icon={<FiRefreshCw />} loading={busy === `sync-${inv.id}`} onClick={() => sync(inv)}>Atualizar</Button>}
                {inv.status === 'authorized' && <Button size="small" variant="danger" icon={<FiXCircle />} onClick={() => setCancel({ id: inv.id, text: '' })}>Cancelar nota</Button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={s.muted} style={{ margin: '0 0 8px' }}>Nenhuma nota emitida para este pedido.</p>
      )}
      {cfg?.missing?.length > 0 && (
        <p className={s.small} style={{ margin: '0 0 8px', color: 'var(--a-muted)' }}>Falta configurar em Configurações, Nota fiscal: {cfg.missing.join(', ')}.</p>
      )}
      {cfg?.enabled && !active && (
        <div className={o.contactLinks}>
          <Button icon={<FiFileText />} loading={busy === 'emit'} onClick={() => emit()} disabled={!payable || !cfg.has_token}>Emitir nota fiscal</Button>
          {!payable && <span className={s.small} style={{ color: 'var(--a-muted)' }}>Só depois do pagamento.</span>}
          {!cfg.has_token && <span className={s.small} style={{ color: 'var(--a-muted)' }}>Falta o token do emissor no servidor.</span>}
        </div>
      )}

      <Dialog
        open={!!doc}
        onClose={() => setDoc(null)}
        size="s"
        title="CPF ou CNPJ do comprador"
        description="Este pedido não foi pago pelo Mercado Pago, então o documento do comprador precisa ser digitado. Ele vai só para a nota e não fica guardado."
        footer={<><Button variant="ghost" onClick={() => setDoc(null)}>Voltar</Button><Button variant="primary" loading={busy === 'emit'} disabled={![11, 14].includes((doc?.value || '').replace(/\D/g, '').length)} onClick={() => emit(doc.value)}>Emitir nota</Button></>}
      >
        {doc && <TextField label="CPF ou CNPJ" inputMode="numeric" value={doc.value} onChange={e => setDoc({ value: e.target.value.replace(/[^\d./-]/g, '').slice(0, 18), error: '' })} error={doc.error || undefined} data-autofocus />}
      </Dialog>

      <Dialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        size="s"
        title="Cancelar a nota fiscal?"
        description="A SEFAZ aceita cancelar em até 24 horas depois da autorização, com uma justificativa."
        footer={<><Button variant="ghost" onClick={() => setCancel(null)}>Voltar</Button><Button variant="danger" loading={busy === 'cancel'} disabled={(cancel?.text || '').trim().length < 15} onClick={doCancel}>Cancelar nota</Button></>}
      >
        {cancel && <TextField label="Justificativa" multiline value={cancel.text} onChange={e => setCancel(c => ({ ...c, text: e.target.value }))} maxLength={255} hint={`De 15 a 255 caracteres (${cancel.text.trim().length}).`} data-autofocus />}
      </Dialog>
    </div>
  )
}
