import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiXCircle, FiCopy } from 'react-icons/fi'
import api from '../lib/api'
import { useResource, useUnsavedGuard } from '../lib/hooks'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, TextField, SelectField, Switch, Badge, useConfirm, useToast } from '../ui'
import { useAdmin } from '../lib/context'
import { LegalCompanyPanel, LegalPagesPanel, LEGAL_KEYS, validCnpj } from './SettingsLegal'
import SettingsFiscal, { FISCAL_KEYS } from './SettingsFiscal'
import s from './sections.module.css'

const KEYS = [
  'store_name', 'store_email', 'store_phone', 'store_whatsapp', 'store_instagram', 'store_facebook', 'store_address',
  'footer_email', 'footer_phone', 'footer_instagram', 'footer_address', 'footer_credit',
  'maintenance_mode', 'maintenance_message',
  'payment_max_installments', 'payment_pix_discount',
  ...LEGAL_KEYS,
  ...FISCAL_KEYS,
]

export default function Settings() {
  const toast = useToast()
  const confirm = useConfirm()
  const { payments, refreshPayments } = useAdmin()
  useEffect(() => { refreshPayments() }, [refreshPayments])
  const remote = useResource(() => api.get('/settings/admin').then(r => r.data || {}), [])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (remote.data) setForm(Object.fromEntries(KEYS.map(k => [k, remote.data[k] ?? ''])))
  }, [remote.data])

  const changed = useMemo(() => (form && remote.data
    ? KEYS.filter(k => String(form[k] ?? '') !== String(remote.data[k] ?? ''))
    : []), [form, remote.data])
  useUnsavedGuard(changed.length > 0)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    const turningOn = changed.includes('maintenance_mode') && form.maintenance_mode === 'true'
    if (turningOn && !(await confirm({ title: 'Colocar a loja em manutenção?', message: 'Quem abrir a loja vê só o aviso de manutenção, e ninguém consegue comprar. O painel continua funcionando.', confirmLabel: 'Colocar em manutenção', tone: 'danger' }))) return
    if (form.store_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.store_email)) { toast.error('O e-mail da loja parece errado.'); return }
    if (form.legal_cnpj && !validCnpj(form.legal_cnpj)) { toast.error('O CNPJ não confere. Corrija ou deixe em branco.'); return }
    const disc = Number(String(form.payment_pix_discount || '0').replace(',', '.'))
    if (!(disc >= 0 && disc <= 20)) { toast.error('O desconto do Pix vai de 0 a 20%.'); return }
    setSaving(true)
    try {
      await api.put('/settings', { settings: Object.fromEntries(changed.map(k => [k, form[k]])) })
      toast.good('Configurações salvas.')
      remote.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const loaded = !!form
  useEffect(() => {
    if (loaded && window.location.hash === '#legal') setTimeout(() => document.getElementById('legal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [loaded])

  const maintenance = form?.maintenance_mode === 'true'

  return (
    <div>
      <PageHeader title="Configurações" description="Dados da loja, textos do rodapé e o modo manutenção." />
      <ErrorNote error={remote.error} onRetry={remote.reload} />
      {!form ? <Panel><Skeleton lines={8} height={30} /></Panel> : (
        <div className={s.grid}>
          <Panel title="Manutenção">
            <div className={s.formGrid}>
              <Switch checked={maintenance} onChange={v => setForm(f => ({ ...f, maintenance_mode: v ? 'true' : 'false' }))} label="Loja em manutenção" description="Ligado, a loja mostra só o aviso abaixo. O painel continua funcionando." />
              {maintenance && (
                <p style={{ margin: 0, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--a-warning-wash)' }}>
                  <FiAlertTriangle aria-hidden="true" style={{ color: 'var(--a-warning)', marginTop: 3, flexShrink: 0 }} />
                  Com a manutenção ligada, ninguém consegue comprar.
                </p>
              )}
              <TextField label="Aviso para quem visitar" multiline value={form.maintenance_message} onChange={set('maintenance_message')} placeholder="Estamos preparando o próximo drop. Voltamos já." maxLength={300} />
            </div>
          </Panel>

          <Panel title="Pagamentos" subtitle="Mercado Pago">
            <PaymentsPanel payments={payments} form={form} setForm={setForm} toast={toast} />
          </Panel>

          <LegalCompanyPanel form={form} setForm={setForm} />
          <LegalPagesPanel form={form} setForm={setForm} />
          <SettingsFiscal form={form} setForm={setForm} />

          <div className={s.half}>
            <Panel title="Dados da loja" subtitle="aparecem na etiqueta e nos e-mails">
              <div className={s.formGrid}>
                <TextField label="Nome da loja" value={form.store_name} onChange={set('store_name')} placeholder="Pizantt Drop" />
                <TextField label="E-mail de contato" type="email" value={form.store_email} onChange={set('store_email')} />
                <div className={s.formRow}>
                  <TextField label="Telefone" type="tel" value={form.store_phone} onChange={set('store_phone')} />
                  <TextField label="WhatsApp" type="tel" value={form.store_whatsapp} onChange={set('store_whatsapp')} placeholder="5511999999999" hint="Com DDI e DDD, só números." />
                </div>
                <TextField label="Endereço de envio" value={form.store_address} onChange={set('store_address')} hint="Sai como remetente na etiqueta." />
                <div className={s.formRow}>
                  <TextField label="Instagram" value={form.store_instagram} onChange={set('store_instagram')} placeholder="@pizanttdrop" />
                  <TextField label="Facebook" value={form.store_facebook} onChange={set('store_facebook')} />
                </div>
              </div>
            </Panel>

            <Panel title="Rodapé da loja">
              <div className={s.formGrid}>
                <TextField label="E-mail" type="email" value={form.footer_email} onChange={set('footer_email')} />
                <TextField label="Telefone" type="tel" value={form.footer_phone} onChange={set('footer_phone')} />
                <TextField label="Instagram" value={form.footer_instagram} onChange={set('footer_instagram')} />
                <TextField label="Endereço" value={form.footer_address} onChange={set('footer_address')} />
                <TextField label="Crédito" value={form.footer_credit} onChange={set('footer_credit')} placeholder="Feito por..." />
              </div>
            </Panel>
          </div>

          <div className={s.stickyBar}>
            {changed.length > 0 && <span className={`${s.small} ${s.muted}`}>{changed.length} {changed.length === 1 ? 'alteração' : 'alterações'} sem salvar</span>}
            <Button variant="ghost" disabled={!changed.length} onClick={() => setForm(Object.fromEntries(KEYS.map(k => [k, remote.data[k] ?? ''])))}>Desfazer</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!changed.length}>Salvar configurações</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Check({ ok, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
      {ok ? <FiCheckCircle aria-hidden="true" style={{ color: 'var(--a-good)', flexShrink: 0 }} /> : <FiXCircle aria-hidden="true" style={{ color: 'var(--a-critical)', flexShrink: 0 }} />}
      <span>{children}</span>
    </div>
  )
}

// Estado da integração (sem segredo nenhum) e as escolhas de parcelas e desconto.
function PaymentsPanel({ payments, form, setForm, toast }) {
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.good('Endereço do webhook copiado.') } catch { toast.error('Não deu para copiar. Selecione e copie.') }
  }
  const p = payments || {}
  return (
    <div className={s.formGrid}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {p.enabled ? <Badge tone="good">Pagamento online ligado</Badge> : <Badge tone="warning">Pagamento online desligado</Badge>}
        {p.enabled && (p.test_mode ? <Badge tone="warning">Modo de teste</Badge> : <Badge tone="info">Produção</Badge>)}
      </div>
      {!payments ? (
        <p className={s.muted} style={{ margin: 0 }}>Não deu para ler a configuração de pagamento agora.</p>
      ) : (
        <div>
          <Check ok={p.has_access_token}>Chave de acesso do Mercado Pago (MP_ACCESS_TOKEN)</Check>
          <Check ok={p.has_public_key}>Chave pública (MP_PUBLIC_KEY)</Check>
          <Check ok={p.has_webhook_secret}>Assinatura do webhook (MP_WEBHOOK_SECRET)</Check>
          <Check ok={!!p.api_public_url}>Endereço público da API (API_PUBLIC_URL)</Check>
        </div>
      )}
      {!p.enabled && (
        <p className={s.muted} style={{ margin: 0, fontSize: 14 }}>
          As chaves ficam no servidor, nunca aqui no painel. Pegue no Mercado Pago em Suas integrações, Credenciais. Enquanto estiverem faltando, a loja recebe o pedido sem cobrar e você confirma na mão.
        </p>
      )}
      {p.webhook_url && (
        <div>
          <p className={s.sectionTitle} style={{ fontSize: 13.5, color: 'var(--a-text-2)', fontWeight: 600, marginBottom: 6 }}>Endereço do webhook (cole no Mercado Pago, evento Pagamentos)</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--a-sunken)', border: '1px solid var(--a-line)', overflowWrap: 'anywhere', fontSize: 13.5 }}>{p.webhook_url}</code>
            <Button size="small" icon={<FiCopy />} onClick={() => copy(p.webhook_url)}>Copiar</Button>
          </div>
        </div>
      )}
      <div className={s.formRow}>
        <SelectField
          label="Parcelas no cartão"
          value={String(form.payment_max_installments || '12')}
          onChange={e => setForm(f => ({ ...f, payment_max_installments: e.target.value }))}
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'Só à vista' : `Até ${i + 1}x` }))}
        />
        <TextField
          label="Desconto no Pix"
          suffix="%"
          inputMode="decimal"
          value={form.payment_pix_discount ?? '0'}
          onChange={e => setForm(f => ({ ...f, payment_pix_discount: e.target.value }))}
          hint="Sobre o valor dos produtos, sem o frete. 0 para não dar desconto."
        />
      </div>
    </div>
  )
}
