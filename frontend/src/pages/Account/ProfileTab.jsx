import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiAlertCircle, FiAlertTriangle, FiCheck, FiDownload, FiLogOut, FiTrash2 } from 'react-icons/fi'
import api from '../../services/api'
import { useAccount } from '../../lib/AccountContext'
import { formatPhone } from '../../lib/format'
import { useToast } from '../../components/Toast/Toast'
import CodeInput from '../../components/CodeInput/CodeInput'
import panel from '../../styles/panel.module.css'
import styles from './Account.module.css'

const EASE = [0.22, 1, 0.36, 1]

// Meus dados: nome, telefone e e-mails de novidades (PUT /account/profile),
// a cópia dos dados (GET /account/export) e apagar a conta (código por
// e-mail em POST /account/delete). Sair fica aqui também.
export default function ProfileTab() {
  const { customer, updateProfile, logout, signOutLocal } = useAccount()
  const addToast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState(customer?.name || '')
  const [phone, setPhone] = useState(formatPhone(customer?.phone || ''))
  const [optIn, setOptIn] = useState(Boolean(customer?.marketing_opt_in))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  // apagar a conta: closed | confirm | code
  const [del, setDel] = useState('closed')
  const [code, setCode] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState('')
  const nameId = useId()
  const phoneId = useId()

  useEffect(() => {
    setName(customer?.name || '')
    setPhone(formatPhone(customer?.phone || ''))
    setOptIn(Boolean(customer?.marketing_opt_in))
  }, [customer?.name, customer?.phone, customer?.marketing_opt_in])

  const save = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim(), marketing_opt_in: optIn })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Não deu para salvar agora. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  // cópia dos dados em arquivo JSON, gerado no próprio aparelho
  const exportData = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { data } = await api.get('/account/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      addToast('Não deu para baixar seus dados agora. Tente de novo.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const askDelete = async () => {
    if (delBusy) return
    setDelBusy(true)
    setDelError('')
    try {
      await api.post('/account/delete')
      setCode('')
      setDel('code')
    } catch (err) {
      setDelError(err.response?.data?.error || 'Não deu para mandar o código agora. Tente de novo.')
    } finally {
      setDelBusy(false)
    }
  }

  const confirmDelete = async (value = code) => {
    if (delBusy || String(value).length !== 6) return
    setDelBusy(true)
    setDelError('')
    try {
      await api.post('/account/delete', { code: value })
      signOutLocal()
      addToast('Sua conta foi apagada.', 'info', 5000)
      navigate('/')
    } catch (err) {
      setDelError(err.response?.data?.error || 'Esse código não confere ou venceu. Confira no e-mail e tente de novo.')
      setDelBusy(false)
    }
  }

  return (
    <div className={styles.stack}>
      <form className={panel.card} style={{ marginTop: 0 }} onSubmit={save} noValidate>
        <div className={panel.field}>
          <span className={panel.label}>E-mail</span>
          <p className={styles.readonly}>{customer?.email}</p>
        </div>
        <label className={panel.field} htmlFor={nameId}>
          <span className={panel.label}>Nome</span>
          <input id={nameId} className={panel.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={120} />
        </label>
        <label className={panel.field} htmlFor={phoneId}>
          <span className={panel.label}>Telefone ou WhatsApp</span>
          <input id={phoneId} className={panel.input} type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} autoComplete="tel-national" inputMode="tel" enterKeyHint="done" placeholder="(11) 99999-9999" maxLength={16} />
        </label>
        <label className={styles.switchRow}>
          <input type="checkbox" className={styles.switchInput} checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          <span className={styles.switch} aria-hidden="true" />
          <span className={styles.switchText}>
            <span>Receber e-mails de novidades e drops</span>
            <span className={panel.hint}>Pode desligar quando quiser.</span>
          </span>
        </label>
        {error && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {error}</p>}
        <button type="submit" className="pz-btn" disabled={saving}>
          {saving ? 'Salvando…' : saved ? <><FiCheck aria-hidden="true" /> Salvo</> : 'Salvar'}
        </button>
      </form>

      <div className={styles.rowActions}>
        <button type="button" className="pz-btn-ghost" onClick={exportData} disabled={exporting}>
          <FiDownload aria-hidden="true" /> {exporting ? 'Preparando…' : 'Baixar meus dados'}
        </button>
        <button type="button" className="pz-btn-ghost" onClick={logout}>
          <FiLogOut aria-hidden="true" /> Sair da conta
        </button>
      </div>

      <section className={styles.danger} aria-labelledby="apagar-conta">
        <h2 id="apagar-conta" className={styles.sectionTitle}>Apagar minha conta</h2>
        <AnimatePresence mode="wait" initial={false}>
          {del === 'closed' && (
            <motion.div key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <p className={styles.dangerText}>Apaga seus dados pessoais, favoritos e pontos. Não dá para desfazer.</p>
              <button type="button" className={styles.dangerBtn} onClick={() => setDel('confirm')}>
                <FiTrash2 aria-hidden="true" /> Quero apagar minha conta
              </button>
            </motion.div>
          )}
          {del === 'confirm' && (
            <motion.div key="confirm" className={styles.dangerBox} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
              <p className={styles.dangerWarn}><FiAlertTriangle aria-hidden="true" /> Antes de apagar, leia com calma:</p>
              <ul className={styles.dangerList}>
                <li>Seus dados pessoais, favoritos, cupons e pontos somem de vez.</li>
                <li>Pedidos com nota fiscal ficam guardados pelo prazo que a lei exige, só para fins fiscais.</li>
                <li>Pedido em andamento continua sendo entregue.</li>
              </ul>
              <p className={styles.dangerText}>Para confirmar, mandamos um código para o seu e-mail.</p>
              {delError && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {delError}</p>}
              <div className={panel.actions}>
                <button type="button" className="pz-btn-ghost" onClick={() => { setDel('closed'); setDelError('') }}>Cancelar</button>
                <button type="button" className={styles.dangerBtn} onClick={askDelete} disabled={delBusy}>
                  {delBusy ? 'Enviando…' : 'Mandar o código'}
                </button>
              </div>
            </motion.div>
          )}
          {del === 'code' && (
            <motion.div key="code" className={styles.dangerBox} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
              <p className={styles.dangerText}>Digite o código que chegou em {customer?.email} para apagar a conta.</p>
              <CodeInput value={code} onChange={(v) => { setCode(v); setDelError('') }} disabled={delBusy} invalid={Boolean(delError)} />
              {delError && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {delError}</p>}
              <div className={panel.actions}>
                <button type="button" className="pz-btn-ghost" onClick={() => { setDel('closed'); setDelError('') }}>Cancelar</button>
                <button type="button" className={styles.dangerBtn} onClick={() => confirmDelete()} disabled={delBusy || code.length !== 6}>
                  {delBusy ? 'Apagando…' : 'Apagar minha conta'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}
