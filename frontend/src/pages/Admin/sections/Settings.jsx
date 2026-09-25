import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle } from 'react-icons/fi'
import api from '../lib/api'
import { useResource, useUnsavedGuard } from '../lib/hooks'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, TextField, Switch, useConfirm, useToast } from '../ui'
import s from './sections.module.css'

const KEYS = [
  'store_name', 'store_email', 'store_phone', 'store_whatsapp', 'store_instagram', 'store_facebook', 'store_address',
  'footer_email', 'footer_phone', 'footer_instagram', 'footer_address', 'footer_credit',
  'maintenance_mode', 'maintenance_message',
]

export default function Settings() {
  const toast = useToast()
  const confirm = useConfirm()
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
    setSaving(true)
    try {
      await api.put('/settings', { settings: Object.fromEntries(changed.map(k => [k, form[k]])) })
      toast.good('Configurações salvas.')
      remote.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

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
