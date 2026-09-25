import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi'
import api from './lib/api'
import { Button, TextField } from './ui'
import { SneakerSketch } from './art/Art'
import { BRAND } from '../../config/brand'
import s from './login.module.css'

// Estrelas fixas (sempre as mesmas posições: nada de pular a cada render).
const STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return { x: r(1) * 100, y: r(2) * 100, s: 0.6 + r(3) * 1.6, d: r(4) * 4 }
})

export default function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { username: username.trim(), password })
      onLogin(data.user, data.token)
    } catch (err) {
      setError(err.status === 401 ? 'Usuário ou senha não conferem.' : err.message)
      setLoading(false)
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
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <img src={BRAND.logo} alt={BRAND.name} className={s.logo} />
        <h1 className={s.title}>Painel da loja</h1>
        <p className={s.sub}>Entre com o usuário e a senha da equipe.</p>

        {(error || notice) && (
          <p className={s.alert} role="alert"><FiAlertCircle aria-hidden="true" />{error || notice}</p>
        )}

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
              autoComplete="current-password"
              required
            />
            <button type="button" className={s.eye} onClick={() => setShow(v => !v)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}>
              {show ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        <Button type="submit" variant="primary" block loading={loading} disabled={!username || !password}>
          Entrar
        </Button>
        <a className={s.back} href="/">Voltar para a loja</a>
      </motion.form>
    </div>
  )
}
