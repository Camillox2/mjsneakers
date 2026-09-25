import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiEye, FiEyeOff, FiAlertCircle, FiShield } from 'react-icons/fi'
import api from './lib/api'
import { Button, TextField } from './ui'
import { SneakerSketch } from './art/Art'
import Turnstile, { useTurnstile } from '../../components/Turnstile/Turnstile'
import { BRAND } from '../../config/brand'
import s from './login.module.css'

// Estrelas fixas (sempre as mesmas posições: nada de pular a cada render).
const STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return { x: r(1) * 100, y: r(2) * 100, s: 0.6 + r(3) * 1.6, d: r(4) * 4 }
})

export default function Login({ onLogin, notice }) {
  const [step, setStep] = useState('password') // password | code
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [caps, setCaps] = useState(false)
  // Caps Lock ligado é o motivo mais comum de "senha não confere"
  const watchCaps = (e) => { if (typeof e.getModifierState === 'function') setCaps(e.getModifierState('CapsLock')) }
  const captcha = useTurnstile()

  const fail = (err) => {
    const left = err.data?.attempts_left
    setError(err.status === 401 && step === 'password'
      ? 'Usuário ou senha não conferem.'
      : err.data?.code === 'mfa_locked' ? 'Código errado vezes demais. Entre com a senha de novo.'
        : Number.isInteger(left) ? `Código não confere. Restam ${left} ${left === 1 ? 'tentativa' : 'tentativas'}.` : err.message)
    setLoading(false)
    if (err.data?.code === 'captcha') captcha.reset?.()
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await captcha.getToken().catch(() => '')
      const { data } = await api.post('/auth/login', { username: username.trim(), password }, { headers: token ? { 'X-Turnstile-Token': token } : {} })
      if (data?.mfa_required) {
        // a senha confere; falta o código do app autenticador
        setMfaToken(data.mfa_token)
        setPassword('')
        setStep('code')
        setLoading(false)
        return
      }
      onLogin(data.user)
    } catch (err) {
      fail(err)
    }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = recovery ? { mfa_token: mfaToken, recovery_code: code.trim() } : { mfa_token: mfaToken, code: code.replace(/\D/g, '') }
      const { data } = await api.post('/auth/login/mfa', body)
      onLogin(data.user)
    } catch (err) {
      // 5 erros travam o código, e ele vence em 5 min: aí volta para a senha
      if (err.data?.code === 'mfa_locked' || (err.status === 401 && /expir|venc/i.test(err.message))) {
        setStep('password')
        setCode('')
      }
      fail(err)
    }
  }

  return (
    <div className={s.wrap}>
      <div className={s.sky} aria-hidden="true">
        {STARS.map((st, i) => (
          <span key={i} className={s.star} style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />
        ))}
        <span className={s.comet} />
        <SneakerSketch className={s.sneaker} stroke="url(#chrome)" />
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbfcfd" />
              <stop offset="0.45" stopColor="#aab1bd" />
              <stop offset="0.6" stopColor="#e9ecf1" />
              <stop offset="1" stopColor="#8e95a1" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <motion.form
        className={s.card}
        onSubmit={step === 'password' ? submitPassword : submitCode}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <img src={BRAND.logo} alt={BRAND.name} className={s.logo} />
        <h1 className={s.title}>{step === 'password' ? 'Painel da loja' : 'Confirme que é você'}</h1>
        <p className={s.sub}>
          {step === 'password'
            ? 'Entre com o usuário e a senha da equipe.'
            : recovery ? 'Digite um dos códigos de recuperação que você guardou.' : 'Abra o app autenticador e digite o código de 6 dígitos.'}
        </p>

        {(error || notice) && (
          <p className={s.alert} role="alert"><FiAlertCircle aria-hidden="true" />{error || notice}</p>
        )}

        {step === 'password' ? (
          <div className={s.fields}>
            <TextField
              label="Usuário"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <div className={s.pass}>
              <TextField
                label="Senha"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyUp={watchCaps}
                onKeyDown={watchCaps}
                onBlur={() => setCaps(false)}
                autoComplete="current-password"
                hint={caps ? 'O Caps Lock está ligado.' : undefined}
                required
              />
              <button type="button" className={s.eye} onClick={() => setShow(v => !v)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}>
                {show ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            <Turnstile captcha={captcha} />
          </div>
        ) : (
          <div className={s.fields}>
            <TextField
              key={recovery ? 'rec' : 'otp'}
              label={recovery ? 'Código de recuperação' : 'Código do app'}
              value={code}
              onChange={e => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode={recovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
            />
            <button type="button" className={`${s.back} ${s.backStart}`} onClick={() => { setRecovery(r => !r); setCode(''); setError('') }}>
              {recovery ? 'Usar o código do app' : 'Perdi o celular: usar um código de recuperação'}
            </button>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          block
          loading={loading}
          icon={step === 'code' ? <FiShield /> : undefined}
          disabled={step === 'password' ? !username || !password : recovery ? code.trim().length < 6 : code.length !== 6}
        >
          {step === 'password' ? 'Entrar' : 'Confirmar'}
        </Button>
        {step === 'code' ? (
          <button type="button" className={s.back} onClick={() => { setStep('password'); setCode(''); setMfaToken(''); setError('') }}>Voltar para a senha</button>
        ) : (
          <a className={s.back} href="/">Voltar para a loja</a>
        )}
      </motion.form>
    </div>
  )
}
