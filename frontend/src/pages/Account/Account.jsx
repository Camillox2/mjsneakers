import { useSearchParams, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiArrowLeft, FiAward, FiHeart, FiPackage, FiUser } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { useAccount } from '../../lib/AccountContext'
import { useToast } from '../../components/Toast/Toast'
import SignIn from './SignIn'
import OrdersTab from './OrdersTab'
import PointsTab from './PointsTab'
import FavoritesTab from './FavoritesTab'
import ProfileTab from './ProfileTab'
import panel from '../../styles/panel.module.css'
import styles from './Account.module.css'

const EASE = [0.22, 1, 0.36, 1]
const TABS = [
  { id: 'pedidos', label: 'Pedidos', icon: FiPackage },
  { id: 'pontos', label: 'Pontos e cupons', icon: FiAward },
  { id: 'favoritos', label: 'Favoritos', icon: FiHeart },
  { id: 'dados', label: 'Meus dados', icon: FiUser },
]

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''

// /conta: sem conta, o login por código; com conta, as abas. A aba fica na
// URL (?aba=pontos) para dar para mandar o link direto de uma delas.
export default function Account() {
  const { status, customer, loggedIn } = useAccount()
  const addToast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('aba')) ? params.get('aba') : 'pedidos'

  const pick = (id) => setParams(id === 'pedidos' ? {} : { aba: id }, { replace: true })

  return (
    <main className={panel.page}>
      <title>{`Minha conta | ${BRAND.name}`}</title>
      <div className={`${panel.container} ${loggedIn ? panel.wide : ''}`}>
        <Link to="/" className={panel.back}>
          <FiArrowLeft aria-hidden="true" /> Voltar para a loja
        </Link>

        {status === 'checking' && (
          <div className={styles.skeleton} aria-busy="true" aria-live="polite">
            <span className="pz-visually-hidden">Abrindo a sua conta</span>
            <span /><span /><span />
          </div>
        )}

        {status !== 'checking' && !loggedIn && (
          <>
            <h1 className={panel.title}>Minha conta</h1>
            <p className={panel.lead}>Acompanhe pedidos, pontos e favoritos. Sem senha: você entra com um código no e-mail.</p>
            <SignIn
              onSignedIn={(me) => {
                const n = firstName(me?.name)
                addToast(n ? `Oi, ${n}. Você entrou na sua conta.` : 'Você entrou na sua conta.', 'success')
              }}
            />
          </>
        )}

        {loggedIn && (
          <>
            <header className={styles.head}>
              <h1 className={panel.title}>{firstName(customer?.name) ? `Oi, ${firstName(customer.name)}` : 'Minha conta'}</h1>
              <p className={styles.headSub}>{customer?.email}</p>
            </header>

            <nav className={styles.tabs} aria-label="Seções da conta" role="tablist">
              {TABS.map((t) => {
                const Icon = t.icon
                const on = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={`${styles.tab} ${on ? styles.tabOn : ''}`}
                    onClick={() => pick(t.id)}
                  >
                    <Icon aria-hidden="true" /> {t.label}
                  </button>
                )
              })}
            </nav>

            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                key={tab}
                role="tabpanel"
                className={styles.panel}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                {tab === 'pedidos' && <OrdersTab />}
                {tab === 'pontos' && <PointsTab />}
                {tab === 'favoritos' && <FavoritesTab />}
                {tab === 'dados' && <ProfileTab />}
              </motion.section>
            </AnimatePresence>
          </>
        )}
      </div>
    </main>
  )
}
