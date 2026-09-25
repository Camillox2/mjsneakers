import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiXCircle, FiCopy } from 'react-icons/fi'
import api from '../lib/api'
import { useResource, useUnsavedGuard } from '../lib/hooks'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, TextField, SelectField, Switch, Badge, useConfirm, useToast } from '../ui'
import { useAdmin } from '../lib/context'
import { LegalCompanyPanel, LegalPagesPanel, LEGAL_KEYS, validCnpj } from './SettingsLegal'
import SettingsFiscal, { FISCAL_KEYS, fiscalErrors, normalizeFiscal } from './SettingsFiscal'
import { parseDecimal } from './formInput'
import s from './sections.module.css'
import cf from './Settings.module.css'

const KEYS = [
  'store_name', 'store_email', 'store_phone', 'store_whatsapp', 'store_instagram', 'store_facebook', 'store_address',
  'footer_email', 'footer_phone', 'footer_instagram', 'footer_address', 'footer_credit',
  'maintenance_mode', 'maintenance_message',
  'payment_max_installments', 'payment_pix_discount',
  ...LEGAL_KEYS,
  ...FISCAL_KEYS,
]

// Mudar pagamento ou nota fiscal exige as duas etapas em quem muda (o servidor confere).
const NEEDS_2FA = /^(fiscal_|payment_)/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SECTIONS = [
  { id: 'cfg-manutencao', label: 'Manutenção' },
  { id: 'cfg-pagamentos', label: 'Pagamentos' },
  { id: 'cfg-empresa', label: 'Empresa' },
  { id: 'cfg-textos', label: 'Textos legais' },
  { id: 'cfg-nota', label: 'Nota fiscal' },
  { id: 'cfg-loja', label: 'Loja e rodapé' },
]

// As regras do servidor, com a mensagem no campo em vez do nome técnico da chave.
function validate(form) {
  const e = {}
  for (const k of ['store_email', 'footer_email', 'legal_email', 'legal_dpo_email']) {
    if (String(form[k] || '').trim() && !EMAIL.test(String(form[k]).trim())) e[k] = 'E-mail inválido.'
  }
  if (form.legal_cnpj && !validCnpj(form.legal_cnpj)) e.legal_cnpj = 'CNPJ não confere. Corrija ou deixe em branco.'
  const wa = String(form.store_whatsapp || '').replace(/\D/g, '')
  if (wa && (wa.length < 12 || wa.length > 13)) e.store_whatsapp = 'Use 55, o DDD e o número, ex.: 5511999999999.'
  const disc = String(form.payment_pix_discount ?? '').trim() === '' ? 0 : parseDecimal(form.payment_pix_discount)
  if (!(disc >= 0 && disc <= 20)) e.payment_pix_discount = 'O desconto do Pix vai de 0 a 20%.'
  return { ...e, ...fiscalErrors(form) }
}

// Valor no formato que o servidor grava.
function normalize(key, value) {
  if (key.startsWith('fiscal_')) return normalizeFiscal(key, value)
  if (key === 'store_whatsapp') return String(value || '').replace(/\D/g, '')
  if (key === 'payment_pix_discount') return String(value ?? '').trim() === '' ? '0' : String(parseDecimal(value))
  return typeof value === 'string' ? value.trim() : value
}

const fromRemote = (data) => Object.fromEntries(KEYS.map(k => [k, data[k] ?? '']))

export default function Settings() {
  const toast = useToast()
  const confirm = useConfirm()
  const { user, payments, refreshPayments } = useAdmin()
  useEffect(() => { refreshPayments() }, [refreshPayments])
  const remote = useResource(() => api.get('/settings/admin').then(r => r.data || {}), [])
  const [form, setForm] = useState(null)
  // erros da última conferência, com os valores conferidos: o erro some quando o campo muda
  const [checked, setChecked] = useState({ errors: {}, form: null })
  const [saving, setSaving] = useState(false)
  const [legalVersion, setLegalVersion] = useState(() => Date.now())
  const locked = !user?.totp_enabled

  useEffect(() => {
    if (remote.data) { setForm(fromRemote(remote.data)); setChecked({ errors: {}, form: null }) }
  }, [remote.data])

  const errors = useMemo(() => Object.fromEntries(Object.entries(checked.errors)
    .filter(([k]) => checked.form && form?.[k] === checked.form[k])), [checked, form])

  const changed = useMemo(() => (form && remote.data
    ? KEYS.filter(k => String(form[k] ?? '') !== String(remote.data[k] ?? ''))
    : []), [form, remote.data])
  useUnsavedGuard(changed.length > 0)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (saving) return
    // só o que mudou vai para o servidor, então só o que mudou é conferido
    const found = Object.fromEntries(Object.entries(validate(form)).filter(([k]) => changed.includes(k)))
    setChecked({ errors: found, form })
    if (Object.keys(found).length) {
      toast.error('Confira os campos marcados.')
      // leva até o primeiro campo com problema
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 50)
      return
    }
    if (locked && changed.some(k => NEEDS_2FA.test(k))) { toast.error('Ligue a verificação em duas etapas (em Equipe) para mudar pagamento ou nota fiscal.'); return }
    const turningOn = changed.includes('maintenance_mode') && form.maintenance_mode === 'true'
    if (turningOn && !(await confirm({ title: 'Colocar a loja em manutenção?', message: 'Quem abrir a loja vê só o aviso de manutenção, e ninguém consegue comprar. O painel continua funcionando.', confirmLabel: 'Colocar em manutenção', tone: 'danger' }))) return
    setSaving(true)
    try {
      await api.put('/settings', { settings: Object.fromEntries(changed.map(k => [k, normalize(k, form[k])])) })
      toast.good('Configurações salvas.')
      setLegalVersion(Date.now())
      remote.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const undo = async () => {
    if (!(await confirm({ title: 'Desfazer as alterações?', message: changed.length === 1 ? 'A alteração feita desde o último salvamento some.' : `As ${changed.length} alterações feitas desde o último salvamento somem.`, confirmLabel: 'Desfazer', cancelLabel: 'Continuar editando', tone: 'danger' }))) return
    setForm(fromRemote(remote.data))
    setChecked({ errors: {}, form: null })
  }

  const loaded = !!form
  useEffect(() => {
    if (loaded && window.location.hash === '#legal') setTimeout(() => document.getElementById('legal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [loaded])

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const maintenance = form?.maintenance_mode === 'true'

  return (
    <div>
      <PageHeader title="Configurações" description="Dados da loja e da empresa, pagamento, nota fiscal, textos legais e o modo manutenção." />
      <ErrorNote error={remote.error} onRetry={remote.reload} />
      {!form ? (!remote.error && <Panel><Skeleton lines={8} height={30} /></Panel>) : (
        <>
          <nav className={cf.jump} aria-label="Partes desta página">
            {SECTIONS.map(x => <button key={x.id} type="button" className={cf.jumpLink} onClick={() => jump(x.id)}>{x.label}</button>)}
          </nav>
          <div className={s.grid}>
            <div id="cfg-manutencao" className={cf.anchor}>
              <Panel title="Manutenção">
                <div className={s.formGrid}>
                  <Switch checked={maintenance} onChange={v => setForm(f => ({ ...f, maintenance_mode: v ? 'true' : 'false' }))} label="Loja em manutenção" description="Ligado, a loja mostra só o aviso abaixo. O painel continua funcionando." />
                  {maintenance && (
                    <p className={cf.warn} role="status">
                      <FiAlertTriangle aria-hidden="true" />
                      Com a manutenção ligada, ninguém consegue comprar.
                    </p>
                  )}
                  <TextField label="Aviso para quem visitar" multiline value={form.maintenance_message} onChange={set('maintenance_message')} placeholder="Estamos preparando o próximo drop. Voltamos já." maxLength={300} />
                </div>
              </Panel>
            </div>

            <div id="cfg-pagamentos" className={cf.anchor}>
              <Panel title="Pagamentos" subtitle="Mercado Pago">
                <PaymentsPanel payments={payments} form={form} set={set} errors={errors} locked={locked} toast={toast} />
              </Panel>
            </div>

            <div id="cfg-empresa" className={cf.anchor}>
              <LegalCompanyPanel form={form} setForm={setForm} errors={errors} />
            </div>
            <div id="cfg-textos" className={cf.anchor}>
              <LegalPagesPanel form={form} setForm={setForm} version={legalVersion} />
            </div>
            <div id="cfg-nota" className={cf.anchor}>
              <SettingsFiscal form={form} setForm={setForm} errors={errors} locked={locked} />
            </div>

            <div id="cfg-loja" className={`${s.half} ${cf.anchor}`}>
              <Panel title="Dados da loja" subtitle="aparecem na etiqueta e nos e-mails">
                <div className={s.formGrid}>
                  <TextField label="Nome da loja" value={form.store_name} onChange={set('store_name')} maxLength={120} />
                  <TextField label="E-mail de contato" type="email" value={form.store_email} onChange={set('store_email')} error={errors.store_email} maxLength={160} />
                  <div className={s.formRow}>
                    <TextField label="Telefone" type="tel" value={form.store_phone} onChange={set('store_phone')} maxLength={40} />
                    <TextField label="WhatsApp" type="tel" inputMode="numeric" value={form.store_whatsapp} onChange={set('store_whatsapp')} error={errors.store_whatsapp} placeholder="5511999999999" hint="Com 55 e o DDD, só números." maxLength={20} />
                  </div>
                  <TextField label="Endereço de envio" value={form.store_address} onChange={set('store_address')} hint="Sai como remetente na etiqueta." maxLength={300} />
                  <div className={s.formRow}>
                    <TextField label="Instagram" value={form.store_instagram} onChange={set('store_instagram')} placeholder="@sualoja" maxLength={120} />
                    <TextField label="Facebook" value={form.store_facebook} onChange={set('store_facebook')} maxLength={200} />
                  </div>
                </div>
              </Panel>

              <Panel title="Rodapé da loja">
                <div className={s.formGrid}>
                  <TextField label="E-mail" type="email" value={form.footer_email} onChange={set('footer_email')} error={errors.footer_email} maxLength={160} />
                  <TextField label="Telefone" type="tel" value={form.footer_phone} onChange={set('footer_phone')} maxLength={40} />
                  <TextField label="Instagram" value={form.footer_instagram} onChange={set('footer_instagram')} maxLength={120} />
                  <TextField label="Endereço" value={form.footer_address} onChange={set('footer_address')} maxLength={300} />
                  <TextField label="Crédito" value={form.footer_credit} onChange={set('footer_credit')} placeholder="Feito por..." maxLength={200} />
                </div>
              </Panel>
            </div>

            <div className={s.stickyBar}>
              {changed.length > 0 && <span className={`${s.small} ${s.muted}`} role="status">{changed.length} {changed.length === 1 ? 'alteração' : 'alterações'} sem salvar</span>}
              <Button variant="ghost" disabled={!changed.length || saving} onClick={undo}>Desfazer</Button>
              <Button variant="primary" onClick={save} loading={saving} disabled={!changed.length}>Salvar configurações</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Check({ ok, children }) {
  return (
    <div className={cf.check}>
      {ok ? <FiCheckCircle aria-hidden="true" className={cf.ok} /> : <FiXCircle aria-hidden="true" className={cf.bad} />}
      <span>{children}<span className={cf.srOnly}>{ok ? ': configurado' : ': faltando'}</span></span>
    </div>
  )
}

// Estado da integração (sem segredo nenhum) e as escolhas de parcelas e desconto.
function PaymentsPanel({ payments, form, set, errors, locked, toast }) {
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.good('Endereço do webhook copiado.') } catch { toast.error('Não deu para copiar. Selecione e copie.') }
  }
  const p = payments || {}
  return (
    <div className={s.formGrid}>
      <div className={cf.row}>
        {p.enabled ? <Badge tone="good">Pagamento online ligado</Badge> : <Badge tone="warning">Pagamento online desligado</Badge>}
        {p.enabled && (p.test_mode ? <Badge tone="warning">Modo de teste</Badge> : <Badge tone="info">Produção</Badge>)}
      </div>
      {!payments ? (
        <p className={cf.note}>Não deu para ler a configuração de pagamento agora.</p>
      ) : (
        <div>
          <Check ok={p.has_access_token}>Chave de acesso do Mercado Pago (MP_ACCESS_TOKEN)</Check>
          <Check ok={p.has_public_key}>Chave pública (MP_PUBLIC_KEY)</Check>
          <Check ok={p.has_webhook_secret}>Assinatura do webhook (MP_WEBHOOK_SECRET)</Check>
          <Check ok={!!p.api_public_url}>Endereço público da API (API_PUBLIC_URL)</Check>
        </div>
      )}
      {!p.enabled && (
        <p className={cf.note}>
          As chaves ficam no servidor, nunca aqui no painel. Pegue no Mercado Pago em Suas integrações, Credenciais. Enquanto estiverem faltando, a loja recebe o pedido sem cobrar e você confirma na mão.
        </p>
      )}
      {p.webhook_url && (
        <div>
          <p className={cf.label}>Endereço do webhook (cole no Mercado Pago, evento Pagamentos)</p>
          <div className={cf.row}>
            <code className={cf.code}>{p.webhook_url}</code>
            <Button size="small" icon={<FiCopy />} onClick={() => copy(p.webhook_url)}>Copiar</Button>
          </div>
        </div>
      )}
      {locked && (
        <p className={cf.warn} role="note">
          <FiAlertTriangle aria-hidden="true" />
          Para mudar parcelas e desconto, ligue a verificação em duas etapas na sua conta (em Equipe).
        </p>
      )}
      <fieldset className={cf.lockable} disabled={locked}>
        <div className={s.formRow}>
          <SelectField
            label="Parcelas no cartão"
            value={String(form.payment_max_installments || '12')}
            onChange={set('payment_max_installments')}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'Só à vista' : `Até ${i + 1}x` }))}
          />
          <TextField
            label="Desconto no Pix"
            suffix="%"
            inputMode="decimal"
            value={form.payment_pix_discount ?? '0'}
            onChange={set('payment_pix_discount')}
            error={errors.payment_pix_discount}
            hint="Sobre o valor dos produtos, sem o frete. 0 para não dar desconto."
          />
        </div>
      </fieldset>
    </div>
  )
}
