import { useEffect, useState } from 'react'
import { FiAward, FiCheck, FiCopy, FiGift, FiShoppingBag } from 'react-icons/fi'
import api from '../../services/api'
import { useAccount } from '../../lib/AccountContext'
import { brl, copyText, shortDate } from '../../lib/format'
import styles from './Account.module.css'

const n = (v) => Number(v) || 0
const pts = (v) => n(v).toLocaleString('pt-BR')

// Cupom da conta: "10% de desconto", "R$ 20 de desconto"
function couponValue(c) {
  const v = n(c.value)
  if (!v) return ''
  return c.type === 'percentage' || c.type === 'percent' ? `${v.toLocaleString('pt-BR')}% de desconto` : `${brl(v)} de desconto`
}

// Pontos e cupons: saldo (em pontos e em reais), como ganhar, como usar, o
// extrato (GET /account/points) e os cupons que a conta pode usar.
export default function PointsTab() {
  const { customer } = useAccount()
  const [history, setHistory] = useState(null)
  const [copied, setCopied] = useState('')
  const loyalty = customer?.loyalty || {}
  const coupons = Array.isArray(customer?.coupons) ? customer.coupons : []

  useEffect(() => {
    let alive = true
    api.get('/account/points')
      .then(({ data }) => alive && setHistory(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []))
      .catch(() => alive && setHistory([]))
    return () => {
      alive = false
    }
  }, [])

  const copy = async (code) => {
    if (await copyText(code)) {
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? '' : c)), 2000)
    }
  }

  const perReal = n(loyalty.points_per_real)
  const perDiscount = n(loyalty.points_per_real_discount)

  return (
    <div className={styles.stack}>
      {loyalty.enabled === false ? (
        <p className={styles.note}>O programa de pontos está pausado no momento. Os pontos que você já tem continuam guardados.</p>
      ) : (
        <>
          <div className={styles.balance}>
            <span className={styles.balanceIcon} aria-hidden="true"><FiAward /></span>
            <span className={styles.balanceText}>
              <span className={styles.balancePoints}>{pts(customer?.points)} pontos</span>
              <span className={styles.balanceValue}>valem {brl(customer?.points_value)} em desconto</span>
            </span>
          </div>

          <div className={styles.howGrid}>
            <div className={styles.how}>
              <span className={styles.howIcon} aria-hidden="true"><FiShoppingBag /></span>
              <p className={styles.howTitle}>Como ganhar</p>
              <p className={styles.howText}>
                {perReal > 0
                  ? `${pts(perReal)} ${perReal === 1 ? 'ponto' : 'pontos'} para cada R$ 1 em pedido entregue.`
                  : 'Você ganha pontos a cada pedido entregue.'}
              </p>
            </div>
            <div className={styles.how}>
              <span className={styles.howIcon} aria-hidden="true"><FiGift /></span>
              <p className={styles.howTitle}>Como usar</p>
              <p className={styles.howText}>
                {perDiscount > 0 ? `Cada ${pts(perDiscount)} pontos viram R$ 1 de desconto na finalização` : 'Use os pontos na finalização da compra'}
                {n(loyalty.max_redeem_percent) > 0 ? `, até ${n(loyalty.max_redeem_percent)}% do pedido` : ''}
                {n(loyalty.min_redeem) > 0 ? `, a partir de ${pts(loyalty.min_redeem)} pontos` : ''}.
              </p>
            </div>
          </div>
        </>
      )}

      <section aria-labelledby="cupons-conta">
        <h2 id="cupons-conta" className={styles.sectionTitle}>Seus cupons</h2>
        {coupons.length === 0 ? (
          <p className={styles.empty}>Nenhum cupom disponível agora. Quando aparecer um, ele fica aqui e na sacola.</p>
        ) : (
          <ul className={styles.coupons}>
            {coupons.map((c) => (
              <li key={c.code} className={styles.coupon}>
                <span className={styles.couponText}>
                  <span className={styles.couponCode}>{c.code}</span>
                  <span className={styles.couponDesc}>{c.description || couponValue(c)}</span>
                  <span className={styles.couponRules}>
                    {[
                      n(c.min_order) > 0 ? `Pedido a partir de ${brl(c.min_order)}` : '',
                      c.valid_until ? `Vale até ${shortDate(c.valid_until)}` : '',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" className={styles.copyBtn} onClick={() => copy(c.code)} aria-label={`Copiar o cupom ${c.code}`}>
                  {copied === c.code ? <><FiCheck aria-hidden="true" /> Copiado</> : <><FiCopy aria-hidden="true" /> Copiar</>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="extrato-pontos">
        <h2 id="extrato-pontos" className={styles.sectionTitle}>Extrato de pontos</h2>
        {!history ? (
          <div className={styles.skeleton} aria-busy="true"><span /><span /></div>
        ) : history.length === 0 ? (
          <p className={styles.empty}>Ainda sem movimento. Os pontos entram quando um pedido é entregue.</p>
        ) : (
          <ul className={styles.ledger}>
            {history.map((h) => {
              const v = n(h.points)
              return (
                <li key={h.id} className={styles.ledgerRow}>
                  <span className={styles.ledgerText}>
                    <span className={styles.ledgerDesc}>{h.description || (v >= 0 ? 'Pontos ganhos' : 'Pontos usados')}</span>
                    <span className={styles.ledgerDate}>
                      {shortDate(h.created_at)}{h.order_id ? ` · pedido #${h.order_id}` : ''}
                    </span>
                  </span>
                  <span className={`${styles.ledgerPoints} ${v >= 0 ? styles.plus : styles.minus}`}>
                    {v >= 0 ? '+' : '-'}{pts(Math.abs(v))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
