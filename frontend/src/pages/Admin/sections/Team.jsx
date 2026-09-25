import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiPlus, FiLock, FiShield, FiRefreshCw, FiCopy, FiEye, FiEyeOff, FiAlertTriangle } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { ago } from '../lib/format'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, Dialog, TextField, SelectField, Badge, Switch, useConfirm, useToast } from '../ui'
import TwoFactorPanel from './TwoFactor'
import s from './sections.module.css'
import tm from './Team.module.css'

const ROLES = { super_admin: 'Dono', admin: 'Administrador', editor: 'Editor', atendimento: 'Atendimento' }
const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/

function strength(pw) {
  let n = 0
  if (pw.length >= 8) n++
  if (pw.length >= 12) n++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++
  if (/\d/.test(pw)) n++
  if (/[^A-Za-z0-9]/.test(pw)) n++
  return n <= 2 ? { label: 'Fraca', tone: 'critical' } : n <= 3 ? { label: 'Razoável', tone: 'warning' } : { label: 'Forte', tone: 'good' }
}

// Senha provisória forte, sem letras que se confundem (l e 1, O e 0): ela é
// passada de boca ou por mensagem. Em blocos de 4 para ditar sem errar.
function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  const raw = Array.from(bytes, b => chars[b % chars.length]).join('')
  return raw.match(/.{4}/g).join('-')
}

export default function Team() {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAdmin()
  const [params] = useSearchParams()
  const createId = useId()
  const admins = useResource(() => api.get('/auth/admins').then(r => asList(r.data)), [])
  const policy = useResource(() => api.get('/settings/admin').then(r => r.data?.admin_require_2fa === 'true').catch(() => false), [])
  const owner = user?.role === 'super_admin'
  const has2fa = !!user?.totp_enabled
  const [create, setCreate] = useState(null)
  const [createErrors, setCreateErrors] = useState({})
  const [showPw, setShowPw] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [busy, setBusy] = useState('')
  // com a regra de duas etapas ligada e a conta sem ela, o servidor só libera a tela de ligar
  const blocked = admins.error?.data?.code === '2fa_setup_required'

  const openCreate = () => { setCreateErrors({}); setShowPw(false); setCreate({ username: '', password: '', role: 'admin' }) }

  const add = async (e) => {
    e?.preventDefault()
    if (busy) return
    const username = create.username.trim()
    const next = {}
    if (!USERNAME.test(username)) next.username = 'De 3 a 50 letras, números, ponto, hífen ou _. Sem espaço nem acento.'
    if (create.password.length < 8) next.password = 'Pelo menos 8 caracteres.'
    else if (create.password.length > 128) next.password = 'No máximo 128 caracteres.'
    setCreateErrors(next)
    if (Object.keys(next).length) return
    setBusy('create')
    try {
      await api.post('/auth/admins', { username, password: create.password, role: create.role })
      toast.good(`${username} adicionado. Já pode entrar no painel.`)
      setCreate(null)
      admins.reload()
    } catch (err) {
      if (err.status === 409) setCreateErrors({ username: 'Já existe alguém com esse usuário.' })
      toast.error(err.message)
    } finally { setBusy('') }
  }

  const generate = () => { setCreate(c => ({ ...c, password: randomPassword() })); setShowPw(true); setCreateErrors(x => ({ ...x, password: undefined })) }
  const copyPassword = async () => {
    try { await navigator.clipboard.writeText(create.password); toast.good('Senha copiada. Passe por um canal seguro.') } catch { toast.error('Não deu para copiar. Anote a senha.') }
  }

  const toggle = async (a) => {
    if (busy) return
    if (a.active && !(await confirm({ title: `Desativar ${a.username}?`, message: 'A pessoa sai do painel na hora e não consegue entrar de novo até você reativar.', confirmLabel: 'Desativar', tone: 'danger' }))) return
    setBusy(`t${a.id}`)
    try {
      await api.put(`/auth/admins/${a.id}/toggle`, { active: !a.active })
      toast.good(a.active ? `${a.username} desativado.` : `${a.username} reativado.`)
      admins.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (busy) return
    if (pw.next.length < 8) { setPwError('A nova senha precisa de pelo menos 8 caracteres.'); return }
    if (pw.next !== pw.confirm) { setPwError('A confirmação não bate com a nova senha.'); return }
    setPwError('')
    setBusy('pw')
    try {
      // a troca derruba as outras sessões; esta recebe um cookie novo do servidor
      await api.put('/auth/change-password', { current_password: pw.current, new_password: pw.next })
      setPw({ current: '', next: '', confirm: '' })
      toast.good('Senha trocada. Outros aparelhos vão pedir para entrar de novo.')
    } catch (err) {
      if (err.status === 400) setPwError(err.message)
      else toast.error(err.message)
    } finally { setBusy('') }
  }

  const st = pw.next ? strength(pw.next) : null

  const setPolicy = async (on) => {
    if (!has2fa) { toast.error('Ligue a verificação na sua conta antes de mudar esta regra.'); return }
    if (on && !(await confirm({ title: 'Exigir duas etapas de toda a equipe?', message: 'Quem ainda não ligou só consegue abrir a tela de ligar, até terminar.', confirmLabel: 'Exigir de todos' }))) return
    setBusy('policy')
    try {
      await api.put('/settings', { settings: { admin_require_2fa: on ? 'true' : 'false' } })
      policy.mutate(on)
      toast.good(on ? 'Agora a equipe inteira entra com duas etapas.' : 'As duas etapas ficaram opcionais.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  // Só o dono mexe em outro dono; ninguém se desativa (o servidor recusa os dois).
  const lockReason = (a, me) => (me ? 'Você não pode se desativar.' : a.role === 'super_admin' && !owner ? 'Só o dono mexe em outro dono.' : '')

  return (
    <div className={s.grid}>
      <PageHeader
        title="Equipe"
        description="Quem pode entrar no painel. Cada pessoa com o próprio usuário: assim o registro de atividade mostra quem fez o quê."
        actions={!blocked && <Button variant="primary" icon={<FiPlus />} onClick={openCreate}>Adicionar pessoa</Button>}
      />
      <TwoFactorPanel required={params.get('duas-etapas') === '1' || policy.data === true || blocked} onChange={() => { admins.reload(); policy.reload() }} />

      {owner && !blocked && (
        <Panel title="Regra da equipe">
          <Switch
            checked={!!policy.data}
            disabled={busy === 'policy' || policy.loading || !has2fa}
            onChange={setPolicy}
            label="Exigir verificação em duas etapas de todo mundo"
            description={has2fa ? 'Recomendado: o painel mexe com dinheiro (estorno) e com dados de clientes.' : 'Ligue as duas etapas na sua conta (acima) para poder mudar esta regra.'}
          />
        </Panel>
      )}

      {blocked ? (
        <Panel title="Pessoas com acesso">
          <p className={tm.note}>A lista e a troca de senha aparecem assim que você ligar a verificação em duas etapas, logo acima.</p>
        </Panel>
      ) : (
        <div className={s.cols2}>
          <Panel title="Pessoas com acesso">
            <ErrorNote error={admins.error} onRetry={admins.reload} />
            {!has2fa && <p className={tm.note}>Para adicionar ou desativar alguém, ligue antes as duas etapas na sua conta.</p>}
            {admins.loading && !admins.data ? <Skeleton lines={3} height={36} /> : (
              <div className={s.list}>
                {(admins.data || []).map(a => {
                  const me = a.is_self ?? (a.id === user?.id || a.username === user?.username)
                  const lock = lockReason(a, me)
                  return (
                    <div key={a.id} className={s.listItem}>
                      <span className={tm.avatar} aria-hidden="true">{a.username.slice(0, 2).toUpperCase()}</span>
                      <div className={s.listMain}>
                        <div className={s.listTitle}>{a.username}{me ? ' (você)' : ''}</div>
                        <div className={s.listSub}>{ROLES[a.role] || 'Equipe'}{a.last_login ? `, entrou ${ago(a.last_login)}` : ', nunca entrou'}</div>
                        <div className={tm.badges}>
                          {a.totp_enabled ? <Badge tone="good" icon={<FiShield />}>2 etapas</Badge> : <Badge tone="warning">Sem 2 etapas</Badge>}
                          {!a.active && <Badge>Desativado</Badge>}
                        </div>
                      </div>
                      <span title={lock || undefined}>
                        <Switch
                          checked={!!a.active}
                          disabled={!!lock || busy === `t${a.id}` || (a.active && !has2fa)}
                          onChange={() => toggle(a)}
                          label={`${a.active ? 'Desativar' : 'Reativar'} ${a.username}${lock ? ` (${lock})` : ''}`}
                          hideLabel
                        />
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel title="Minha senha">
            <form className={s.formGrid} onSubmit={changePassword} noValidate>
              <input type="text" autoComplete="username" value={user?.username || ''} readOnly hidden />
              <TextField label="Senha atual" type="password" autoComplete="current-password" value={pw.current} onChange={e => { setPwError(''); setPw(p => ({ ...p, current: e.target.value })) }} required />
              <TextField label="Nova senha" type="password" autoComplete="new-password" value={pw.next} onChange={e => { setPwError(''); setPw(p => ({ ...p, next: e.target.value })) }} hint="Pelo menos 8 caracteres. Frase longa é melhor que símbolo." maxLength={128} required />
              {st && <div><Badge tone={st.tone}>Senha {st.label.toLowerCase()}</Badge></div>}
              <TextField label="Repita a nova senha" type="password" autoComplete="new-password" value={pw.confirm} onChange={e => { setPwError(''); setPw(p => ({ ...p, confirm: e.target.value })) }} error={pw.confirm && pw.confirm !== pw.next ? 'Não bate com a nova senha.' : undefined} maxLength={128} required />
              {pwError && <p className={tm.warn} role="alert"><FiAlertTriangle aria-hidden="true" />{pwError}</p>}
              <div><Button type="submit" variant="primary" icon={<FiLock />} loading={busy === 'pw'} disabled={!pw.current || !pw.next || pw.next !== pw.confirm}>Trocar senha</Button></div>
            </form>
          </Panel>
        </div>
      )}

      <Dialog
        open={!!create}
        onClose={() => setCreate(null)}
        size="s"
        title="Adicionar pessoa"
        description="Passe o usuário e a senha em mãos ou por um canal seguro."
        footer={<><Button variant="ghost" onClick={() => setCreate(null)}>Cancelar</Button><Button type="submit" form={createId} variant="primary" loading={busy === 'create'} disabled={!has2fa}>Adicionar pessoa</Button></>}
      >
        {create && (
          <form id={createId} className={s.formGrid} onSubmit={add} noValidate>
            {!has2fa && (
              <p className={tm.warn} role="alert">
                <FiAlertTriangle aria-hidden="true" />
                Para adicionar alguém, ligue antes a verificação em duas etapas na sua conta.
              </p>
            )}
            <TextField label="Usuário" value={create.username} onChange={e => setCreate(c => ({ ...c, username: e.target.value }))} error={createErrors.username} hint="Letras, números, ponto, hífen ou _. É com ele que a pessoa entra." maxLength={50} autoCapitalize="none" spellCheck={false} data-autofocus autoComplete="off" />
            <TextField label="Senha provisória" type={showPw ? 'text' : 'password'} value={create.password} onChange={e => setCreate(c => ({ ...c, password: e.target.value }))} error={createErrors.password} maxLength={128} autoComplete="new-password" spellCheck={false} hint="Pelo menos 8 caracteres. Peça para a pessoa trocar no primeiro acesso." />
            <div className={tm.row}>
              <Button size="small" icon={<FiRefreshCw />} onClick={generate}>Gerar senha forte</Button>
              <Button size="small" variant="ghost" icon={showPw ? <FiEyeOff /> : <FiEye />} onClick={() => setShowPw(v => !v)} aria-pressed={showPw}>{showPw ? 'Esconder senha' : 'Mostrar senha'}</Button>
              {create.password && <Button size="small" variant="ghost" icon={<FiCopy />} onClick={copyPassword}>Copiar senha</Button>}
            </div>
            <SelectField
              label="Papel"
              value={create.role}
              onChange={e => setCreate(c => ({ ...c, role: e.target.value }))}
              options={owner ? [{ value: 'admin', label: 'Administrador' }, { value: 'super_admin', label: 'Dono' }] : [{ value: 'admin', label: 'Administrador' }]}
              hint={owner ? 'Dono faz tudo, inclusive estorno e mexer em outros donos.' : 'Só o dono pode adicionar outro dono.'}
            />
          </form>
        )}
      </Dialog>
    </div>
  )
}
