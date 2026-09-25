import { useState } from 'react'
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiRefreshCw, FiDownload, FiDatabase, FiSend, FiCopy } from 'react-icons/fi'
import api, { asPage, downloadFile } from '../lib/api'
import { useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { ago, dateTime, number } from '../lib/format'
import { PageHeader, Panel, Button, Segmented, ErrorNote, Skeleton, EmptyState, Pagination, TextField, Badge, useToast } from '../ui'
import { Stars } from '../art/Art'
import s from './sections.module.css'

// Saúde do sistema: o que está ligado, o backup, o e-mail do domínio e os
// erros que aconteceram (no servidor e no navegador de quem usa a loja).

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function Line({ state, label, detail }) {
  const icon = state === 'ok' ? <FiCheckCircle style={{ color: 'var(--a-good)' }} /> : state === 'warn' ? <FiAlertTriangle style={{ color: 'var(--a-warning)' }} /> : <FiXCircle style={{ color: 'var(--a-critical)' }} />
  return (
    <div className={s.listItem} style={{ alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{ fontSize: 18, marginTop: 2 }}>{icon}</span>
      <div className={s.listMain}>
        <div className={s.strong}>{label}</div>
        {detail && <div className={s.small} style={{ color: 'var(--a-muted)', whiteSpace: 'normal' }}>{detail}</div>}
      </div>
    </div>
  )
}

export default function Health() {
  const toast = useToast()
  const { user } = useAdmin()
  const health = useResource(() => api.get('/admin/health').then(r => r.data), [])
  const backups = useResource(() => api.get('/backups').then(r => r.data), [])
  const email = useResource(() => api.get('/admin/email-health').then(r => r.data), [])
  const [errStatus, setErrStatus] = useState('open')
  const [page, setPage] = useState(1)
  const errors = useResource(() => api.get('/admin/errors', { params: { status: errStatus, page, limit: 20 } }).then(r => asPage(r.data, page)), [errStatus, page])
  const [busy, setBusy] = useState('')
  const [testTo, setTestTo] = useState('')
  const [openStack, setOpenStack] = useState(null)

  const h = health.data
  const b = h?.backups || {}
  const owner = user?.role === 'super_admin'

  const runBackup = async () => {
    setBusy('backup')
    try {
      const { data } = await api.post('/backups')
      toast.good(`Backup feito: ${data.name} (${kb(data.size)})${data.remote_error ? '. O envio para o armazenamento externo falhou.' : ''}`)
      backups.reload(); health.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const verify = async () => {
    setBusy('verify')
    try {
      const { data } = await api.post('/backups/verify')
      if (data.ok) toast.good(`Restauração testada: ${data.detail}`)
      else toast.error(`O teste falhou: ${data.detail}`)
      backups.reload(); health.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const download = async (name) => {
    setBusy(`dl-${name}`)
    try { await downloadFile(`/backups/${encodeURIComponent(name)}/download`, undefined, name) } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const sendTest = async () => {
    setBusy('email')
    try {
      const { data } = await api.post('/admin/email-test', { to: testTo.trim() })
      toast.good(data.message || 'Enviado.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const resolve = async (e, status) => {
    try { await api.put(`/admin/errors/${e.id}`, { status }); errors.reload(); health.reload() } catch (err) { toast.error(err.message) }
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.good('Copiado.') } catch { toast.error('Não deu para copiar.') }
  }

  return (
    <div className={s.grid}>
      <PageHeader
        title="Saúde do sistema"
        description="O que está ligado, o backup do banco, o e-mail da loja e os erros que aconteceram."
        actions={<Button icon={<FiRefreshCw />} onClick={() => { health.reload(); backups.reload(); email.reload(); errors.reload() }}>Atualizar</Button>}
      />
      <ErrorNote error={health.error} onRetry={health.reload} />

      <div className={s.cols2}>
        <Panel title="Peças do sistema">
          {!h ? <Skeleton lines={7} height={22} /> : (
            <div className={s.list}>
              <Line state={h.db.ok ? 'ok' : 'bad'} label="Banco de dados" detail={h.db.ok ? `Respondendo em ${h.db.latency_ms} ms` : 'O banco não respondeu'} />
              <Line state={h.payments.enabled ? (h.payments.webhook_secret ? 'ok' : 'warn') : 'warn'} label="Pagamento online (Mercado Pago)"
                detail={!h.payments.enabled ? 'Desligado: faltam as chaves no servidor.' : `${h.payments.test_mode ? 'Modo de teste' : 'Produção'}${h.payments.webhook_secret ? '' : '. Falta a assinatura do webhook (MP_WEBHOOK_SECRET).'}`} />
              <Line state={h.email.configured ? (h.email.dkim ? 'ok' : 'warn') : 'bad'} label="Envio de e-mail"
                detail={!h.email.configured ? 'Sem servidor de e-mail: nenhum e-mail sai (confirmação, rastreio, códigos de login).' : h.email.dkim ? 'Configurado, com assinatura DKIM.' : 'Configurado, mas sem assinatura DKIM.'} />
              <Line state={h.captcha.enabled ? 'ok' : 'warn'} label="Captcha contra robôs (Turnstile)" detail={h.captcha.enabled ? 'Ligado no login, checkout, newsletter, conta e LGPD.' : 'Desligado: faltam TURNSTILE_SITE_KEY e TURNSTILE_SECRET.'} />
              <Line state={h.twofa && h.twofa.with_2fa === h.twofa.admins ? 'ok' : 'warn'} label="Duas etapas na equipe"
                detail={h.twofa ? `${h.twofa.with_2fa} de ${h.twofa.admins} ${h.twofa.admins === 1 ? 'pessoa ligou' : 'pessoas ligaram'}.` : 'Ainda sem dados.'} />
              <Line state={h.security.jwt_secret_strong && h.security.cookie_secure ? 'ok' : h.api.env === 'production' ? 'bad' : 'warn'} label="Segurança do servidor"
                detail={[!h.security.jwt_secret_strong && 'JWT_SECRET curto (use 32 caracteres ou mais)', !h.security.cookie_secure && 'cookies sem Secure (normal só em desenvolvimento)'].filter(Boolean).join('; ') || 'Segredos fortes e cookies protegidos.'} />
              <Line state={h.invoices.configured ? 'ok' : 'warn'} label="Nota fiscal" detail={h.invoices.configured ? `Emissor ligado (${h.invoices.env === 'producao' ? 'produção' : 'homologação'}).` : 'Emissor não configurado.'} />
              <Line state="ok" label="Servidor" detail={`No ar há ${number(Math.round(h.api.uptime_s / 3600))} h, ${h.api.node}, fuso ${h.api.timezone || 'do sistema'}.`} />
            </div>
          )}
        </Panel>

        <Panel title="Backup do banco" actions={<Button size="small" icon={<FiDatabase />} loading={busy === 'backup'} onClick={runBackup}>Fazer agora</Button>}>
          {!backups.data ? <Skeleton lines={5} height={22} /> : (
            <div className={s.formGrid}>
              <div className={s.list}>
                <Line state={b.last_backup_at && !b.last_error ? 'ok' : 'bad'} label="Último backup"
                  detail={b.last_backup_at ? `${dateTime(b.last_backup_at)} (${ago(b.last_backup_at)}), ${kb(b.last_size || 0)}${b.last_error ? `. Último erro: ${b.last_error}` : ''}` : 'Nenhum backup feito ainda.'} />
                <Line state={b.last_verify_ok ? 'ok' : b.last_verify_at ? 'bad' : 'warn'} label="Teste de restauração"
                  detail={b.last_verify_at ? `${dateTime(b.last_verify_at)}: ${b.last_verify_detail}` : 'Nunca testado. Backup que nunca foi restaurado é só uma esperança.'} />
                <Line state={b.encrypted ? 'ok' : 'warn'} label="Cifrado" detail={b.encrypted ? 'Os arquivos são cifrados (AES-256).' : 'Sem BACKUP_ENC_KEY: os arquivos têm dados de clientes em aberto.'} />
                <Line state={b.remote?.configured ? (b.last_remote_ok === false ? 'bad' : 'ok') : 'warn'} label="Cópia fora do servidor"
                  detail={b.remote?.configured ? `Enviado para ${b.remote.bucket} (${b.remote.host})${b.last_remote_ok === false ? ', mas o último envio falhou' : ''}.` : 'Só no disco do servidor: se ele for perdido, o backup vai junto. Configure um armazenamento S3 ou R2.'} />
                <Line state="ok" label="Agenda" detail={b.enabled ? `Todo dia às ${b.schedule_hour}h, guardando ${b.keep_days} dias.` : 'Backup automático desligado (BACKUP_DISABLED).'} />
              </div>
              <div><Button icon={<FiCheckCircle />} loading={busy === 'verify'} onClick={verify}>Testar a restauração</Button></div>
              {backups.data.files?.length > 0 && (
                <div className={s.list}>
                  {backups.data.files.slice(0, 7).map(f => (
                    <div key={f.name} className={s.listItem}>
                      <div className={s.listMain}>
                        <div className={s.listTitle}>{dateTime(f.created_at)}</div>
                        <div className={s.listSub}>{kb(f.size)}{f.encrypted ? ', cifrado' : ''}</div>
                      </div>
                      {owner && <Button size="small" variant="ghost" icon={<FiDownload />} loading={busy === `dl-${f.name}`} onClick={() => download(f.name)} aria-label="Baixar backup" />}
                    </div>
                  ))}
                </div>
              )}
              {!owner && <p className={s.small} style={{ color: 'var(--a-muted)', margin: 0 }}>Só o dono, com duas etapas ligadas, baixa os arquivos.</p>}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="E-mail da loja" subtitle={email.data?.domain ? `domínio ${email.data.domain}` : ''}>
        {!email.data ? <Skeleton lines={4} height={22} /> : !email.data.domain ? (
          <p className={s.muted} style={{ margin: 0 }}>Defina EMAIL_FROM (ex.: loja@seudominio.com.br) no servidor para conferir o domínio.</p>
        ) : (
          <div className={s.formGrid}>
            <div className={s.list}>
              {email.data.checks.map(c => (
                <div key={c.key} className={s.listItem} style={{ alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{ fontSize: 18, marginTop: 2 }}>{c.ok ? <FiCheckCircle style={{ color: 'var(--a-good)' }} /> : <FiAlertTriangle style={{ color: 'var(--a-warning)' }} />}</span>
                  <div className={s.listMain}>
                    <div className={s.strong}>{c.label}</div>
                    {c.value && <div className={s.small} style={{ color: 'var(--a-muted)', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{c.value}</div>}
                    {c.hint && (
                      <div className={s.small} style={{ whiteSpace: 'normal', marginTop: 4 }}>
                        {c.hint}
                        {/"([^"]+)"/.test(c.hint) && <Button size="small" variant="ghost" icon={<FiCopy />} aria-label="Copiar o registro sugerido" onClick={() => copy(c.hint.match(/"([^"]+)"/)[1])} />}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TextField label="Mandar um e-mail de teste para" type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="voce@exemplo.com" style={{ minWidth: 240 }} />
              <Button icon={<FiSend />} loading={busy === 'email'} disabled={!testTo.includes('@')} onClick={sendTest}>Enviar teste</Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Erros registrados" subtitle={h?.errors ? `${number(h.errors.last_24h)} nas últimas 24 h` : ''}
        actions={<Segmented label="Situação" value={errStatus} onChange={v => { setErrStatus(v); setPage(1) }} options={[{ value: 'open', label: 'Abertos' }, { value: 'resolved', label: 'Resolvidos' }]} />}>
        <ErrorNote error={errors.error} onRetry={errors.reload} />
        {errors.loading && !errors.data ? <Skeleton lines={4} height={30} /> : errors.data?.items?.length ? (
          <div className={s.list}>
            {errors.data.items.map(e => (
              <div key={e.id} className={s.listItem} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className={s.listMain} style={{ minWidth: 220 }}>
                  <div className={s.strong} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{e.message}</div>
                  <div className={s.small} style={{ color: 'var(--a-muted)' }}>
                    {e.source === 'frontend' ? 'Navegador' : 'Servidor'}{e.path ? `, ${e.path}` : ''}, {number(e.count)} {Number(e.count) === 1 ? 'vez' : 'vezes'}, a última {ago(e.last_seen)}
                  </div>
                  {openStack === e.id && e.stack && (
                    <pre style={{ margin: '8px 0 0', padding: 10, borderRadius: 8, background: 'var(--a-sunken)', border: '1px solid var(--a-line)', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }}>{e.stack}</pre>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {e.stack && <Button size="small" variant="ghost" onClick={() => setOpenStack(openStack === e.id ? null : e.id)}>{openStack === e.id ? 'Esconder detalhes' : 'Detalhes'}</Button>}
                  {e.status === 'open'
                    ? <Button size="small" icon={<FiCheckCircle />} onClick={() => resolve(e, 'resolved')}>Resolvido</Button>
                    : <Button size="small" variant="ghost" onClick={() => resolve(e, 'open')}>Reabrir</Button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState art={<Stars />} title={errStatus === 'open' ? 'Nenhum erro aberto' : 'Nenhum erro resolvido'}>
            Quando algo quebrar no servidor ou no navegador de alguém, aparece aqui e você recebe um e-mail.
          </EmptyState>
        )}
        <Pagination page={page} pages={errors.data?.pages} onChange={setPage} />
      </Panel>

      <p className={s.small} style={{ color: 'var(--a-muted)', margin: 0 }}>
        Para saber na hora se o site cair, cadastre o endereço <strong>/api/health</strong> num monitor gratuito como UptimeRobot ou BetterStack.
        {h?.api && <Badge tone="info">{h.api.env === 'production' ? 'produção' : 'desenvolvimento'}</Badge>}
      </p>
    </div>
  )
}
