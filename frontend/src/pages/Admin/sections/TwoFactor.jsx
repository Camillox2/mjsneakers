import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { FiShield, FiCopy, FiDownload, FiSmartphone } from 'react-icons/fi'
import api from '../lib/api'
import { useAdmin } from '../lib/context'
import { Panel, Button, Dialog, TextField, Badge, useConfirm, useToast } from '../ui'
import s from './sections.module.css'

// Verificação em duas etapas da própria conta (TOTP, app autenticador).
// O QR é desenhado aqui no navegador: o segredo não passa por serviço nenhum.

const groups = (secret) => String(secret || '').replace(/\s/g, '').match(/.{1,4}/g)?.join(' ') || ''

function CodesList({ codes }) {
  const toast = useToast()
  const text = codes.join('\n')
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.good('Códigos copiados.') } catch { toast.error('Não deu para copiar. Anote à mão.') }
  }
  const download = () => {
    const blob = new Blob([`Códigos de recuperação do painel da loja\nCada um vale uma vez só.\n\n${text}\n`], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'codigos-recuperacao-painel.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: 14, borderRadius: 12, background: 'var(--a-sunken)', border: '1px solid var(--a-line)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em', fontWeight: 600 }}>
        {codes.map(c => <span key={c}>{c}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" icon={<FiCopy />} onClick={copy}>Copiar</Button>
        <Button size="small" icon={<FiDownload />} onClick={download}>Baixar em .txt</Button>
      </div>
    </div>
  )
}

export default function TwoFactorPanel({ required }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { user, setMe } = useAdmin()
  const on = !!user?.totp_enabled
  const [setup, setSetup] = useState(null) // {secret, otpauth_url, qr}
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const [saved, setSaved] = useState(false)
  const [off, setOff] = useState(null) // {password, code}
  const [renew, setRenew] = useState(null) // {code}
  const [busy, setBusy] = useState('')

  const start = async () => {
    setBusy('setup')
    try {
      const { data } = await api.post('/auth/2fa/setup')
      const qr = await QRCode.toDataURL(data.otpauth_url, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      setSetup({ ...data, qr })
      setCode('')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const enable = async () => {
    setBusy('enable')
    try {
      const { data } = await api.post('/auth/2fa/enable', { code: code.replace(/\D/g, '') })
      setSetup(null)
      setCodes(data.recovery_codes || [])
      setSaved(false)
      setMe?.(prev => ({ ...(prev || {}), totp_enabled: true }))
      toast.good('Verificação em duas etapas ligada.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const disable = async () => {
    setBusy('disable')
    try {
      await api.post('/auth/2fa/disable', { password: off.password, code: off.code.replace(/\D/g, '') })
      setOff(null)
      setMe?.(prev => ({ ...(prev || {}), totp_enabled: false }))
      toast.good('Verificação em duas etapas desligada.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const newCodes = async () => {
    setBusy('renew')
    try {
      const { data } = await api.post('/auth/2fa/recovery-codes', { code: renew.code.replace(/\D/g, '') })
      setRenew(null)
      setCodes(data.recovery_codes || [])
      setSaved(false)
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const closeCodes = async () => {
    if (!saved && !(await confirm({ title: 'Guardou os códigos?', message: 'Eles não aparecem de novo. Sem eles, perder o celular trava o seu acesso.', confirmLabel: 'Já guardei', cancelLabel: 'Voltar' }))) return
    setCodes(null)
  }

  useEffect(() => { if (required && !on) start() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Verificação em duas etapas" subtitle="sua conta">
      <div className={s.formGrid}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {on ? <Badge tone="good" icon={<FiShield />}>Ligada</Badge> : <Badge tone="warning" icon={<FiShield />}>Desligada</Badge>}
          <span className={s.muted} style={{ fontSize: 14 }}>
            {on ? 'Além da senha, o painel pede o código do app autenticador.' : 'Com ela ligada, uma senha vazada sozinha não entra no painel.'}
          </span>
        </div>
        {required && !on && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--a-warning-wash)' }}>
            A loja exige a verificação em duas etapas. Ligue para continuar usando o painel.
          </p>
        )}
        <p className={s.muted} style={{ margin: 0, fontSize: 14 }}>
          Estorno, backup, dados de clientes e a gestão da equipe só funcionam com ela ligada.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!on && <Button variant="primary" icon={<FiShield />} loading={busy === 'setup'} onClick={start}>Ligar agora</Button>}
          {on && <Button onClick={() => setRenew({ code: '' })}>Gerar novos códigos de recuperação</Button>}
          {on && <Button variant="ghost" onClick={() => setOff({ password: '', code: '' })}>Desligar</Button>}
        </div>
      </div>

      <Dialog
        open={!!setup}
        onClose={() => setSetup(null)}
        title="Ligar a verificação em duas etapas"
        description="Use Google Authenticator, Microsoft Authenticator, 1Password ou outro app de códigos."
        footer={<><Button variant="ghost" onClick={() => setSetup(null)}>Cancelar</Button><Button variant="primary" onClick={enable} loading={busy === 'enable'} disabled={code.replace(/\D/g, '').length !== 6}>Confirmar e ligar</Button></>}
      >
        {setup && (
          <div className={s.formGrid}>
            <p style={{ margin: 0 }}><strong>1.</strong> No app, adicione uma conta lendo este QR Code:</p>
            <img src={setup.qr} alt="QR Code para o app autenticador" width="220" height="220" style={{ justifySelf: 'center', borderRadius: 12, background: '#fff', padding: 8 }} />
            <a className={s.linkBtn} href={setup.otpauth_url} style={{ justifySelf: 'center' }}><FiSmartphone aria-hidden="true" /> Está no celular? Toque para abrir o app</a>
            <p className={s.muted} style={{ margin: 0, fontSize: 13.5 }}>Sem câmera? Digite a chave no app: <strong style={{ letterSpacing: '0.08em', color: 'var(--a-text)' }}>{groups(setup.secret)}</strong></p>
            <p style={{ margin: 0 }}><strong>2.</strong> Digite o código de 6 dígitos que o app mostra:</p>
            <TextField label="Código do app" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} data-autofocus />
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!codes}
        onClose={closeCodes}
        title="Guarde os códigos de recuperação"
        description="Se perder o celular, cada código entra uma vez no lugar do app. Guarde num lugar seguro, fora deste computador."
        footer={<Button variant="primary" onClick={() => { setSaved(true); setCodes(null) }}>Guardei os códigos</Button>}
      >
        {codes && <CodesList codes={codes} />}
      </Dialog>

      <Dialog
        open={!!off}
        onClose={() => setOff(null)}
        size="s"
        title="Desligar as duas etapas?"
        description="Sua conta volta a entrar só com a senha."
        footer={<><Button variant="ghost" onClick={() => setOff(null)}>Voltar</Button><Button variant="danger" onClick={disable} loading={busy === 'disable'} disabled={!off?.password || (off?.code || '').replace(/\D/g, '').length !== 6}>Desligar</Button></>}
      >
        {off && (
          <div className={s.formGrid}>
            <TextField label="Sua senha" type="password" autoComplete="current-password" value={off.password} onChange={e => setOff(o => ({ ...o, password: e.target.value }))} data-autofocus />
            <TextField label="Código do app" inputMode="numeric" autoComplete="one-time-code" value={off.code} onChange={e => setOff(o => ({ ...o, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!renew}
        onClose={() => setRenew(null)}
        size="s"
        title="Novos códigos de recuperação"
        description="Os códigos antigos deixam de valer."
        footer={<><Button variant="ghost" onClick={() => setRenew(null)}>Voltar</Button><Button variant="primary" onClick={newCodes} loading={busy === 'renew'} disabled={(renew?.code || '').replace(/\D/g, '').length !== 6}>Gerar</Button></>}
      >
        {renew && <TextField label="Código do app" inputMode="numeric" autoComplete="one-time-code" value={renew.code} onChange={e => setRenew({ code: e.target.value.replace(/\D/g, '').slice(0, 6) })} data-autofocus />}
      </Dialog>
    </Panel>
  )
}
