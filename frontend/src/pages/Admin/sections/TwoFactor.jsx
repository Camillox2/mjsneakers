import { useEffect, useId, useState } from 'react'
import QRCode from 'qrcode'
import { FiShield, FiCopy, FiDownload, FiSmartphone, FiAlertTriangle } from 'react-icons/fi'
import api from '../lib/api'
import { useAdmin } from '../lib/context'
import { Panel, Button, Dialog, TextField, Badge, useConfirm, useToast } from '../ui'
import s from './sections.module.css'
import tm from './Team.module.css'

// Verificação em duas etapas da própria conta (TOTP, app autenticador).
// O QR é desenhado aqui no navegador: o segredo não passa por serviço nenhum.

const groups = (secret) => String(secret || '').replace(/\s/g, '').match(/.{1,4}/g)?.join(' ') || ''
const digits = (v) => String(v || '').replace(/\D/g, '').slice(0, 6)

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
    <div className={tm.codesBox}>
      <ul className={tm.codes} aria-label="Códigos de recuperação">
        {codes.map(c => <li key={c}>{c}</li>)}
      </ul>
      <div className={tm.row}>
        <Button size="small" icon={<FiCopy />} onClick={copy}>Copiar</Button>
        <Button size="small" icon={<FiDownload />} onClick={download}>Baixar em .txt</Button>
      </div>
    </div>
  )
}

// Campo do código de 6 dígitos, igual nos três diálogos.
function CodeField({ value, onChange, autoFocus }) {
  return (
    <TextField
      label="Código do app"
      inputMode="numeric"
      autoComplete="one-time-code"
      enterKeyHint="done"
      maxLength={6}
      value={value}
      onChange={e => onChange(digits(e.target.value))}
      hint="Os 6 números que o app mostra agora. Eles mudam a cada 30 segundos."
      data-autofocus={autoFocus || undefined}
    />
  )
}

export default function TwoFactorPanel({ required, onChange }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { user, setMe } = useAdmin()
  const on = !!user?.totp_enabled
  const ids = { setup: useId(), off: useId(), renew: useId() }
  const [setup, setSetup] = useState(null) // {secret, otpauth_url, qr}
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const [saved, setSaved] = useState(false)
  const [off, setOff] = useState(null) // {password, code}
  const [renew, setRenew] = useState(null) // {code}
  const [busy, setBusy] = useState('')

  const start = async () => {
    if (busy) return
    setBusy('setup')
    try {
      const { data } = await api.post('/auth/2fa/setup')
      const qr = await QRCode.toDataURL(data.otpauth_url, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      setSetup({ ...data, qr })
      setCode('')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const enable = async (e) => {
    e?.preventDefault()
    if (busy || code.length !== 6) return
    setBusy('enable')
    try {
      const { data } = await api.post('/auth/2fa/enable', { code })
      setSetup(null)
      setCodes(data.recovery_codes || [])
      setSaved(false)
      setMe?.(prev => ({ ...(prev || {}), totp_enabled: true }))
      onChange?.()
      toast.good('Verificação em duas etapas ligada.')
    } catch (err) { setCode(''); toast.error(err.message) } finally { setBusy('') }
  }

  const disable = async (e) => {
    e?.preventDefault()
    if (busy || !off?.password || off.code.length !== 6) return
    setBusy('disable')
    try {
      await api.post('/auth/2fa/disable', { password: off.password, code: off.code })
      setOff(null)
      setMe?.(prev => ({ ...(prev || {}), totp_enabled: false }))
      onChange?.()
      toast.good('Verificação em duas etapas desligada.')
    } catch (err) { setOff(o => o && { ...o, code: '' }); toast.error(err.message) } finally { setBusy('') }
  }

  const newCodes = async (e) => {
    e?.preventDefault()
    if (busy || renew?.code.length !== 6) return
    setBusy('renew')
    try {
      const { data } = await api.post('/auth/2fa/recovery-codes', { code: renew.code })
      setRenew(null)
      setCodes(data.recovery_codes || [])
      setSaved(false)
    } catch (err) { setRenew({ code: '' }); toast.error(err.message) } finally { setBusy('') }
  }

  // Fechar sem guardar pergunta antes (Esc, arrastar, voltar do celular, X).
  const canCloseCodes = async () => saved || confirm({
    title: 'Guardou os códigos?',
    message: 'Eles não aparecem de novo. Sem eles, perder o celular trava o seu acesso.',
    confirmLabel: 'Já guardei',
    cancelLabel: 'Voltar aos códigos',
  })

  useEffect(() => { if (required && !on) start() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Verificação em duas etapas" subtitle="sua conta">
      <div className={s.formGrid}>
        <div className={tm.status}>
          {on ? <Badge tone="good" icon={<FiShield />}>Ligada</Badge> : <Badge tone="warning" icon={<FiShield />}>Desligada</Badge>}
          <span className={tm.note}>
            {on ? 'Além da senha, o painel pede o código do app autenticador.' : 'Com ela ligada, uma senha vazada sozinha não entra no painel.'}
          </span>
        </div>
        {required && !on && (
          <p className={tm.warn} role="alert">
            <FiAlertTriangle aria-hidden="true" />
            A loja exige a verificação em duas etapas. Ligue para continuar usando o painel.
          </p>
        )}
        <p className={tm.note}>
          Estorno, backup, dados de clientes, pagamento, nota fiscal e a gestão da equipe só funcionam com ela ligada.
        </p>
        <div className={tm.row}>
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
        footer={<><Button variant="ghost" onClick={() => setSetup(null)}>Cancelar</Button><Button type="submit" form={ids.setup} variant="primary" loading={busy === 'enable'} disabled={code.length !== 6}>Confirmar e ligar</Button></>}
      >
        {setup && (
          <form id={ids.setup} className={s.formGrid} onSubmit={enable} noValidate>
            <p className={tm.step}><strong>1.</strong> No app, adicione uma conta lendo este QR Code:</p>
            <img src={setup.qr} alt="QR Code para o app autenticador" width="220" height="220" className={tm.qr} />
            <a className={`${s.linkBtn} ${tm.center}`} href={setup.otpauth_url}><FiSmartphone aria-hidden="true" /> Está no celular? Toque para abrir o app</a>
            <p className={tm.note}>Sem câmera? Digite a chave no app: <span className={tm.secret}>{groups(setup.secret)}</span></p>
            <p className={tm.step}><strong>2.</strong> Digite o código de 6 dígitos que o app mostra:</p>
            <CodeField value={code} onChange={setCode} autoFocus />
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!codes}
        onClose={() => setCodes(null)}
        canClose={canCloseCodes}
        title="Guarde os códigos de recuperação"
        description="Se perder o celular, cada código entra uma vez no lugar do app. Guarde num lugar seguro, fora deste aparelho."
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
        footer={<><Button variant="ghost" onClick={() => setOff(null)}>Voltar</Button><Button type="submit" form={ids.off} variant="danger" loading={busy === 'disable'} disabled={!off?.password || (off?.code || '').length !== 6}>Desligar</Button></>}
      >
        {off && (
          <form id={ids.off} className={s.formGrid} onSubmit={disable} noValidate>
            {required && (
              <p className={tm.warn}>
                <FiAlertTriangle aria-hidden="true" />
                A loja exige as duas etapas: desligada, o painel só abre a tela de ligar de novo.
              </p>
            )}
            <TextField label="Sua senha" type="password" autoComplete="current-password" value={off.password} onChange={e => setOff(o => ({ ...o, password: e.target.value }))} data-autofocus />
            <CodeField value={off.code} onChange={v => setOff(o => ({ ...o, code: v }))} />
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!renew}
        onClose={() => setRenew(null)}
        size="s"
        title="Novos códigos de recuperação"
        description="Os códigos antigos deixam de valer."
        footer={<><Button variant="ghost" onClick={() => setRenew(null)}>Voltar</Button><Button type="submit" form={ids.renew} variant="primary" loading={busy === 'renew'} disabled={(renew?.code || '').length !== 6}>Gerar códigos</Button></>}
      >
        {renew && (
          <form id={ids.renew} onSubmit={newCodes} noValidate>
            <CodeField value={renew.code} onChange={v => setRenew({ code: v })} autoFocus />
          </form>
        )}
      </Dialog>
    </Panel>
  )
}
