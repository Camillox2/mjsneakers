import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiRefreshCw, FiDownload, FiDatabase, FiSend, FiCopy, FiRotateCcw } from 'react-icons/fi'
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
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000
// Backup e teste de restauração podem passar dos 30 s padrão da API.
const LONG = { timeout: 10 * 60 * 1000 }
// Quem cuida do servidor resolve o que depende de variável de ambiente.
const TECH = 'Peça para quem cuida do servidor'

function uptime(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  if (days) return `${number(days)} ${days === 1 ? 'dia' : 'dias'}${hours ? ` e ${hours} h` : ''}`
  if (hours) return `${hours} h`
  return `${Math.max(1, Math.round(s / 60))} min`
}

const STATE = {
  ok: { icon: FiCheckCircle, className: s.stateOk, text: 'Tudo certo' },
  warn: { icon: FiAlertTriangle, className: s.stateWarn, text: 'Atenção' },
  bad: { icon: FiXCircle, className: s.stateBad, text: 'Problema' },
}

// Uma linha de checagem: ícone e texto dizem a mesma coisa (nunca só a cor).
function Line({ state, label, detail, children }) {
  const m = STATE[state] || STATE.warn
  const Icon = m.icon
  return (
    <div className={`${s.listItem} ${s.checkLine}`}>
      <Icon className={`${s.checkIcon} ${m.className}`} aria-hidden="true" />
      <div className={s.listMain}>
        <div className={s.strong}><span className={s.srOnly}>{m.text}: </span>{label}</div>
        {detail && <div className={s.checkDetail}>{detail}</div>}
        {children}
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
  // o painel do backup usa a própria rota dele (status do arquivo + configuração)
  const b = backups.data ? { ...(backups.data.config || {}), ...(backups.data.status || {}) } : {}
  const running = !!backups.data?.running
  const owner = user?.role === 'super_admin'
  const canDownload = owner && !!user?.totp_enabled
  const lastBackupAt = b.last_backup_at ? new Date(b.last_backup_at).getTime() : 0
  const stale = lastBackupAt && Date.now() - lastBackupAt > TWO_DAYS
  const refreshing = health.loading || backups.loading || email.loading || errors.loading

  const reloadAll = () => { health.reload(); backups.reload(); email.reload(); errors.reload() }

  const runBackup = async () => {
    setBusy('backup')
    try {
      const { data } = await api.post('/backups', undefined, LONG)
      if (data.remote_error) toast.info(`Backup feito (${kb(data.size)}), mas a cópia para o armazenamento externo falhou.`)
      else toast.good(`Backup feito: ${kb(data.size)}${data.remote ? ', com cópia fora do servidor' : ''}.`)
      backups.reload(); health.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const verify = async () => {
    setBusy('verify')
    try {
      const { data } = await api.post('/backups/verify', undefined, LONG)
      if (data.ok) toast.good(`Restauração testada e aprovada. ${data.detail || ''}`.trim())
      else toast.error(`O teste de restauração falhou: ${data.detail}`)
      backups.reload(); health.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const download = async (name) => {
    setBusy(`dl-${name}`)
    try { await downloadFile(`/backups/${encodeURIComponent(name)}/download`, undefined, name, LONG) } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const sendTest = async (e) => {
    e.preventDefault()
    if (busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim())) return
    setBusy('email')
    try {
      const { data } = await api.post('/admin/email-test', { to: testTo.trim() })
      toast.good(data.message || 'E-mail de teste enviado.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const resolve = async (e, status) => {
    setBusy(`err-${e.id}`)
    try {
      await api.put(`/admin/errors/${e.id}`, { status })
      toast.good(status === 'resolved' ? 'Erro marcado como resolvido.' : 'Erro reaberto.')
      errors.reload(); health.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.good('Registro copiado.') } catch { toast.error('Não deu para copiar. Selecione o texto e copie.') }
  }

  return (
    <div className={s.grid}>
      <PageHeader
        title="Saúde do sistema"
        description="O que está ligado, o backup do banco, o e-mail da loja e os erros que aconteceram."
        actions={<Button icon={<FiRefreshCw />} loading={refreshing} onClick={reloadAll}>Atualizar</Button>}
      />

      <div className={s.cols2}>
        <Panel title="Peças do sistema">
          <ErrorNote error={health.error} onRetry={health.reload} />
          {!h ? (!health.error && <Skeleton lines={7} height={22} />) : (
            <div className={s.list}>
              <Line state={h.db.ok ? 'ok' : 'bad'} label="Banco de dados" detail={h.db.ok ? `Respondendo em ${number(h.db.latency_ms)} ms.` : 'O banco não respondeu. A loja não consegue mostrar produtos nem receber pedidos.'} />
              <Line state={h.payments.enabled ? (h.payments.webhook_secret ? 'ok' : 'warn') : 'warn'} label="Pagamento online (Mercado Pago)"
                detail={!h.payments.enabled
                  ? `Desligado: os pedidos são confirmados à mão. ${TECH} colocar as chaves do Mercado Pago.`
                  : `${h.payments.test_mode ? 'Em modo de teste: nenhum dinheiro de verdade entra.' : 'Recebendo pagamentos de verdade.'}${h.payments.webhook_secret ? '' : ` Falta a assinatura dos avisos do Mercado Pago (MP_WEBHOOK_SECRET). ${TECH} configurar.`}`} />
              <Line state={h.email.configured ? (h.email.dkim ? 'ok' : 'warn') : 'bad'} label="Envio de e-mail"
                detail={!h.email.configured
                  ? `Nenhum e-mail sai (confirmação de pedido, rastreio, códigos de login). ${TECH} configurar o servidor de e-mail.`
                  : h.email.dkim ? 'Configurado e com assinatura (DKIM): cai menos no spam.' : 'Configurado, mas sem assinatura (DKIM): os e-mails podem cair no spam.'} />
              <Line state={h.captcha.enabled ? 'ok' : 'warn'} label="Proteção contra robôs (Turnstile)"
                detail={h.captcha.enabled ? 'Ligada no login, no checkout, na newsletter, na conta e nos pedidos de LGPD.' : `Desligada: robôs podem tentar senhas e criar pedidos falsos. ${TECH} configurar o Turnstile.`} />
              <Line state={h.twofa && h.twofa.with_2fa === h.twofa.admins ? 'ok' : 'warn'} label="Duas etapas na equipe"
                detail={h.twofa ? `${number(h.twofa.with_2fa)} de ${number(h.twofa.admins)} ${h.twofa.admins === 1 ? 'pessoa ligou' : 'pessoas ligaram'}.` : 'Ainda sem dados.'}>
                {h.twofa && h.twofa.with_2fa < h.twofa.admins && <Link className={s.linkBtn} to="/admin/equipe">Ver quem falta, em Equipe</Link>}
              </Line>
              <Line state={h.security.jwt_secret_strong && h.security.cookie_secure ? 'ok' : h.api.env === 'production' ? 'bad' : 'warn'} label="Segurança do servidor"
                detail={h.security.jwt_secret_strong && h.security.cookie_secure
                  ? 'Senha interna forte e login protegido no navegador.'
                  : `${[!h.security.jwt_secret_strong && 'a senha interna das sessões (JWT_SECRET) é curta, use 32 caracteres ou mais', !h.security.cookie_secure && 'o login está sem a proteção de conexão segura (normal só em desenvolvimento)'].filter(Boolean).join('; ').replace(/^./, c => c.toUpperCase())}. ${TECH} corrigir.`} />
              <Line state={h.invoices.configured ? 'ok' : 'warn'} label="Nota fiscal"
                detail={h.invoices.configured ? `Emissor ligado, em ${h.invoices.env === 'producao' ? 'produção (notas valem de verdade)' : 'homologação (notas de teste)'}.` : 'Emissor não configurado: a loja não emite nota.'} />
              <Line state="ok" label="Servidor" detail={`No ar há ${uptime(h.api.uptime_s)}${h.api.timezone ? `, fuso ${h.api.timezone}` : ''}.`} />
            </div>
          )}
        </Panel>

        <Panel title="Backup do banco" actions={<Button size="small" icon={<FiDatabase />} loading={busy === 'backup' || running} disabled={!!busy || running || !backups.data} onClick={runBackup}>{running ? 'Fazendo backup' : 'Fazer agora'}</Button>}>
          <ErrorNote error={backups.error} onRetry={backups.reload} />
          {!backups.data ? (!backups.error && <Skeleton lines={5} height={22} />) : (
            <div className={s.formGrid}>
              <div className={s.list}>
                <Line state={b.last_error ? 'bad' : !b.last_backup_at ? 'bad' : stale ? 'warn' : 'ok'} label="Último backup"
                  detail={b.last_backup_at
                    ? `${dateTime(b.last_backup_at)} (${ago(b.last_backup_at)}), ${kb(b.last_size || 0)}.${stale ? ' Faz mais de 2 dias: confira se o backup automático está rodando.' : ''}${b.last_error ? ` A última tentativa falhou: ${b.last_error}` : ''}`
                    : `Nenhum backup feito ainda.${b.last_error ? ` A última tentativa falhou: ${b.last_error}` : ''}`} />
                <Line state={b.last_verify_ok ? 'ok' : b.last_verify_at ? 'bad' : 'warn'} label="Teste de restauração"
                  detail={b.last_verify_at ? `${dateTime(b.last_verify_at)}: ${b.last_verify_detail || (b.last_verify_ok ? 'aprovado' : 'falhou')}` : 'Nunca testado. Backup que nunca foi restaurado é só uma esperança.'} />
                <Line state={b.encrypted ? 'ok' : 'warn'} label="Cifrado"
                  detail={b.encrypted ? 'Os arquivos são cifrados (AES-256): quem pegar o arquivo não lê os dados.' : `Os arquivos têm dados de clientes em aberto. ${TECH} configurar a chave do backup (BACKUP_ENC_KEY).`} />
                <Line state={b.remote?.configured ? (b.last_remote_ok === false ? 'bad' : 'ok') : 'warn'} label="Cópia fora do servidor"
                  detail={b.remote?.configured
                    ? `Enviado para ${b.remote.bucket} (${b.remote.host})${b.last_remote_ok === false ? ', mas o último envio falhou' : ''}.`
                    : `Só no disco do servidor: se ele for perdido, o backup vai junto. ${TECH} ligar um armazenamento externo (S3 ou R2).`} />
                <Line state={b.enabled ? 'ok' : 'warn'} label="Agenda"
                  detail={b.enabled ? `Todo dia às ${b.schedule_hour}h, guardando ${number(b.keep_days)} dias.` : `Backup automático desligado. ${TECH} ligar de novo.`} />
              </div>
              <div><Button icon={<FiCheckCircle />} loading={busy === 'verify'} disabled={!!busy || running || !b.last_backup_at} onClick={verify}>Testar a restauração</Button></div>
              {backups.data.files?.length > 0 && (
                <div>
                  <h3 className={s.sectionTitle}>Arquivos guardados</h3>
                  <div className={s.list}>
                    {backups.data.files.slice(0, 7).map(f => (
                      <div key={f.name} className={s.listItem}>
                        <div className={s.listMain}>
                          <div className={s.listTitle}>{dateTime(f.created_at)}</div>
                          <div className={s.listSub}>{kb(f.size)}{f.encrypted ? ', cifrado' : ''}</div>
                        </div>
                        {canDownload && <Button size="small" variant="ghost" icon={<FiDownload />} loading={busy === `dl-${f.name}`} disabled={!!busy} onClick={() => download(f.name)} aria-label={`Baixar o backup de ${dateTime(f.created_at)}`} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!canDownload && (
                <p className={`${s.small} ${s.muted} ${s.flush}`}>
                  {owner
                    ? <>Para baixar os arquivos, ligue a verificação em duas etapas. <Link className={s.linkBtn} to="/admin/equipe?duas-etapas=1">Ligar agora</Link></>
                    : 'Só o dono da loja, com a verificação em duas etapas ligada, baixa os arquivos.'}
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="E-mail da loja" subtitle={email.data?.domain ? `domínio ${email.data.domain}` : ''}>
        <ErrorNote error={email.error} onRetry={email.reload} />
        {!email.data ? (!email.error && <Skeleton lines={4} height={22} />) : !email.data.domain ? (
          <p className={`${s.muted} ${s.flush}`}>Ainda não há endereço de envio definido. {TECH} configurar o remetente (EMAIL_FROM, ex.: loja@seudominio.com.br).</p>
        ) : (
          <div className={s.formGrid}>
            <p className={`${s.small} ${s.muted} ${s.flush}`}>Estes registros ficam no DNS do domínio (onde o domínio foi comprado). Eles fazem os e-mails da loja chegarem na caixa de entrada e impedem que alguém envie e-mail falso em nome dela.</p>
            <div className={s.list}>
              {email.data.checks.map(c => {
                const record = (String(c.hint || '').match(/"([^"]+)"/) || [])[1]
                return (
                  <Line key={c.key} state={c.ok ? 'ok' : 'warn'} label={c.label}>
                    {c.value && <div className={`${s.checkDetail} ${s.code}`}>{c.value}</div>}
                    {c.hint && <div className={s.checkHint}>{c.hint}</div>}
                    {record && <Button size="small" variant="ghost" icon={<FiCopy />} onClick={() => copy(record)}>Copiar o registro sugerido</Button>}
                  </Line>
                )
              })}
            </div>
            <form className={s.inlineForm} onSubmit={sendTest}>
              <TextField label="Mandar um e-mail de teste para" type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" autoCapitalize="none" />
              <Button type="submit" icon={<FiSend />} loading={busy === 'email'} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim()) || (!!busy && busy !== 'email')}>Enviar teste</Button>
            </form>
          </div>
        )}
      </Panel>

      <Panel title="Erros registrados" subtitle={h?.errors ? `${number(h.errors.last_24h)} nas últimas 24 horas` : ''}
        actions={<Segmented label="Situação dos erros" value={errStatus} onChange={v => { setErrStatus(v); setPage(1) }} options={[{ value: 'open', label: 'Abertos', count: h?.errors?.open_count || undefined }, { value: 'resolved', label: 'Resolvidos' }]} />}>
        <ErrorNote error={errors.error} onRetry={errors.reload} />
        {errors.loading && !errors.data ? <Skeleton lines={4} height={30} /> : errors.data?.items?.length ? (
          <div className={s.list} style={{ opacity: errors.loading ? 0.6 : 1 }}>
            {errors.data.items.map(e => (
              <div key={e.id} className={`${s.listItem} ${s.errorRow}`}>
                <div className={s.listMain}>
                  <div className={`${s.strong} ${s.wrapAny}`}>{e.message}</div>
                  <div className={s.checkDetail}>
                    {e.source === 'frontend' ? 'No navegador de quem usava a loja' : 'No servidor'}{e.path ? `, em ${e.path}` : ''}. {number(e.count)} {Number(e.count) === 1 ? 'vez' : 'vezes'}, a última {ago(e.last_seen)}.
                  </div>
                  {openStack === e.id && e.stack && <pre className={s.stack}>{e.stack}</pre>}
                </div>
                <div className={s.rowActions}>
                  {e.stack && (
                    <Button size="small" variant="ghost" aria-expanded={openStack === e.id} onClick={() => setOpenStack(openStack === e.id ? null : e.id)}>
                      {openStack === e.id ? 'Esconder detalhes' : 'Ver detalhes técnicos'}
                    </Button>
                  )}
                  {e.status === 'open'
                    ? <Button size="small" icon={<FiCheckCircle />} loading={busy === `err-${e.id}`} disabled={!!busy} onClick={() => resolve(e, 'resolved')}>Marcar como resolvido</Button>
                    : <Button size="small" variant="ghost" icon={<FiRotateCcw />} loading={busy === `err-${e.id}`} disabled={!!busy} onClick={() => resolve(e, 'open')}>Reabrir</Button>}
                </div>
              </div>
            ))}
          </div>
        ) : !errors.error && (
          <EmptyState art={<Stars />} title={errStatus === 'open' ? 'Nenhum erro aberto' : 'Nenhum erro resolvido'}>
            Quando algo quebrar no servidor ou no navegador de alguém, aparece aqui e a equipe recebe um e-mail.
          </EmptyState>
        )}
        <Pagination page={page} pages={errors.data?.pages} onChange={setPage} />
      </Panel>

      <p className={`${s.small} ${s.muted} ${s.flush}`}>
        Para saber na hora se o site cair, cadastre o endereço <strong>/api/health</strong> da loja num monitor gratuito como UptimeRobot ou BetterStack.
        {h?.api && <> Este servidor está em <Badge tone="info">{h.api.env === 'production' ? 'produção' : 'desenvolvimento'}</Badge></>}
      </p>
    </div>
  )
}
