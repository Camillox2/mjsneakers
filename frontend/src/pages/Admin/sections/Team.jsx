import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiPlus, FiLock, FiShield } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { ago } from '../lib/format'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, Dialog, TextField, SelectField, Badge, Switch, useConfirm, useToast } from '../ui'
import TwoFactorPanel from './TwoFactor'
import s from './sections.module.css'

const ROLES = { super_admin: 'Dono', admin: 'Administrador', editor: 'Editor', atendimento: 'Atendimento' }

function strength(pw) {
  let n = 0
  if (pw.length >= 8) n++
  if (pw.length >= 12) n++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++
  if (/\d/.test(pw)) n++
  if (/[^A-Za-z0-9]/.test(pw)) n++
  return n <= 2 ? { label: 'Fraca', tone: 'critical' } : n <= 3 ? { label: 'Razoável', tone: 'warning' } : { label: 'Forte', tone: 'good' }
}

export default function Team() {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAdmin()
  const [params] = useSearchParams()
  const admins = useResource(() => api.get('/auth/admins').then(r => asList(r.data)), [])
  const policy = useResource(() => api.get('/settings/admin').then(r => r.data?.admin_require_2fa === 'true').catch(() => false), [])
  const owner = user?.role === 'super_admin'
  const [create, setCreate] = useState(null)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState('')

  const add = async () => {
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(create.username.trim())) { toast.error('Usuário: de 3 a 50 letras, números, ponto, hífen ou _.'); return }
    if (create.password.length < 8) { toast.error('A senha precisa de pelo menos 8 caracteres.'); return }
    setBusy('create')
    try {
      await api.post('/auth/admins', { username: create.username.trim(), password: create.password, role: create.role })
      toast.good(`${create.username.trim()} já pode entrar no painel.`)
      setCreate(null)
      admins.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const toggle = async (a) => {
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
    if (pw.next.length < 8) { toast.error('A nova senha precisa de pelo menos 8 caracteres.'); return }
    if (pw.next !== pw.confirm) { toast.error('A confirmação não bate com a nova senha.'); return }
    setBusy('pw')
    try {
      // a troca derruba as outras sessões; esta recebe um cookie novo do servidor
      await api.put('/auth/change-password', { current_password: pw.current, new_password: pw.next })
      setPw({ current: '', next: '', confirm: '' })
      toast.good('Senha trocada. Outros aparelhos vão pedir para entrar de novo.')
    } catch (err) { toast.error(err.status === 401 || err.status === 400 ? (err.message || 'A senha atual não confere.') : err.message) } finally { setBusy('') }
  }

  const st = pw.next ? strength(pw.next) : null

  const setPolicy = async (on) => {
    if (on && !user?.totp_enabled) { toast.error('Ligue a verificação na sua conta antes de exigir da equipe.'); return }
    if (on && !(await confirm({ title: 'Exigir duas etapas de toda a equipe?', message: 'Quem ainda não ligou só consegue abrir a tela de ligar, até terminar.', confirmLabel: 'Exigir' }))) return
    setBusy('policy')
    try {
      await api.put('/settings', { settings: { admin_require_2fa: on ? 'true' : 'false' } })
      policy.mutate(on)
      toast.good(on ? 'Agora a equipe inteira entra com duas etapas.' : 'As duas etapas ficaram opcionais.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  return (
    <div className={s.grid}>
      <PageHeader
        title="Equipe"
        description="Quem pode entrar no painel. Cada pessoa com o próprio usuário: assim o registro de atividade mostra quem fez o quê."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => setCreate({ username: '', password: '', role: 'admin' })}>Adicionar pessoa</Button>}
      />
      <TwoFactorPanel required={params.get('duas-etapas') === '1' || policy.data === true} />

      {owner && (
        <Panel title="Regra da equipe">
          <Switch
            checked={!!policy.data}
            disabled={busy === 'policy' || policy.loading}
            onChange={setPolicy}
            label="Exigir verificação em duas etapas de todo mundo"
            description="Recomendado: o painel mexe com dinheiro (estorno) e com dados de clientes."
          />
        </Panel>
      )}

      <div className={s.cols2}>
        <Panel title="Pessoas com acesso">
          <ErrorNote error={admins.error} onRetry={admins.reload} />
          {admins.loading && !admins.data ? <Skeleton lines={3} height={36} /> : (
            <div className={s.list}>
              {(admins.data || []).map(a => {
                const me = a.is_self ?? (a.id === user?.id || a.username === user?.username)
                return (
                  <div key={a.id} className={s.listItem}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, background: 'var(--a-raised)', border: '1px solid var(--a-line)', flexShrink: 0 }}>{a.username.slice(0, 2).toUpperCase()}</span>
                    <div className={s.listMain}>
                      <div className={s.listTitle}>{a.username}{me ? ' (você)' : ''}</div>
                      <div className={s.listSub}>{ROLES[a.role] || a.role}{a.last_login ? `, entrou ${ago(a.last_login)}` : ', nunca entrou'}</div>
                    </div>
                    {a.totp_enabled ? <Badge tone="good" icon={<FiShield />}>2 etapas</Badge> : <Badge tone="warning">Sem 2 etapas</Badge>}
                    {!a.active && <Badge>Desativado</Badge>}
                    <Switch checked={!!a.active} disabled={me || busy === `t${a.id}`} onChange={() => toggle(a)} label={`${a.active ? 'Desativar' : 'Reativar'} ${a.username}`} hideLabel />
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Minha senha">
          <form className={s.formGrid} onSubmit={changePassword}>
            <input type="text" autoComplete="username" value={user?.username || ''} readOnly hidden />
            <TextField label="Senha atual" type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} required />
            <TextField label="Nova senha" type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} hint="Pelo menos 8 caracteres. Frase longa é melhor que símbolo." required />
            {st && <div><Badge tone={st.tone}>Senha {st.label.toLowerCase()}</Badge></div>}
            <TextField label="Repita a nova senha" type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} error={pw.confirm && pw.confirm !== pw.next ? 'Não bate com a nova senha.' : undefined} required />
            <div><Button type="submit" variant="primary" icon={<FiLock />} loading={busy === 'pw'} disabled={!pw.current || !pw.next || pw.next !== pw.confirm}>Trocar senha</Button></div>
          </form>
        </Panel>
      </div>

      <Dialog
        open={!!create}
        onClose={() => setCreate(null)}
        size="s"
        title="Adicionar pessoa"
        description="Passe o usuário e a senha em mãos ou por um canal seguro."
        footer={<><Button variant="ghost" onClick={() => setCreate(null)}>Cancelar</Button><Button variant="primary" onClick={add} loading={busy === 'create'}>Adicionar</Button></>}
      >
        {create && (
          <div className={s.formGrid}>
            <TextField label="Usuário" value={create.username} onChange={e => setCreate(c => ({ ...c, username: e.target.value }))} autoCapitalize="none" spellCheck={false} data-autofocus autoComplete="off" />
            <TextField label="Senha provisória" type="password" value={create.password} onChange={e => setCreate(c => ({ ...c, password: e.target.value }))} autoComplete="new-password" hint="Pelo menos 8 caracteres. Peça para a pessoa trocar no primeiro acesso." />
            <SelectField label="Papel" value={create.role} onChange={e => setCreate(c => ({ ...c, role: e.target.value }))} options={[{ value: 'admin', label: 'Administrador' }, { value: 'super_admin', label: 'Dono' }]} />
          </div>
        )}
      </Dialog>
    </div>
  )
}
