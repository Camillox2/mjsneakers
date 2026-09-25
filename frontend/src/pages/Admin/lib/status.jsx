import { FiClock, FiCheck, FiPackage, FiTruck, FiCheckCircle, FiXCircle, FiCreditCard, FiRotateCcw, FiAlertTriangle, FiSlash, FiSearch } from 'react-icons/fi'
import { Badge } from '../ui'

// Status reais do pedido no banco, na ordem do fluxo.
export const ORDER_FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']

export const ORDER_STATUS = {
  pending: { label: 'Aguardando', tone: 'warning', icon: FiClock, hint: 'Pedido novo, ainda não confirmado' },
  confirmed: { label: 'Confirmado', tone: 'info', icon: FiCheck, hint: 'Pagamento conferido' },
  processing: { label: 'Separando', tone: 'info', icon: FiPackage, hint: 'Pares sendo separados e embalados' },
  shipped: { label: 'Enviado', tone: 'info', icon: FiTruck, hint: 'Já saiu para entrega' },
  delivered: { label: 'Entregue', tone: 'good', icon: FiCheckCircle, hint: 'Chegou no cliente' },
  cancelled: { label: 'Cancelado', tone: 'critical', icon: FiXCircle, hint: 'Cancelado, estoque devolvido' },
}

export function OrderBadge({ status }) {
  const m = ORDER_STATUS[status] || { label: status || 'Sem status', tone: 'neutral', icon: FiClock }
  const Icon = m.icon
  return <Badge tone={m.tone} icon={<Icon aria-hidden="true" />}>{m.label}</Badge>
}

// Próximo passo natural de um pedido (o botão principal na lista).
export function nextStatus(status) {
  const i = ORDER_FLOW.indexOf(status)
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null
}

// Situação do pagamento no pedido (Mercado Pago). "unpaid" = ainda não tentou pagar.
export const PAYMENT_STATUS = {
  unpaid: { label: 'Ainda não pagou', tone: 'neutral', icon: FiClock },
  pending: { label: 'Esperando o pagamento', tone: 'warning', icon: FiClock },
  approved: { label: 'Pago', tone: 'good', icon: FiCheckCircle },
  rejected: { label: 'Recusado', tone: 'critical', icon: FiXCircle },
  expired: { label: 'Pix vencido', tone: 'neutral', icon: FiSlash },
  refunded: { label: 'Estornado', tone: 'serious', icon: FiRotateCcw },
  charged_back: { label: 'Contestado', tone: 'critical', icon: FiAlertTriangle },
}

export const PAYMENT_METHOD = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito' }

export function PaymentBadge({ status }) {
  if (!status) return null
  const m = PAYMENT_STATUS[status] || { label: 'Situação desconhecida', tone: 'neutral', icon: FiCreditCard }
  const Icon = m.icon
  return <Badge tone={m.tone} icon={<Icon aria-hidden="true" />}>{m.label}</Badge>
}

// Cada tentativa de pagamento guarda o status cru do Mercado Pago, que tem
// mais estados que o pedido (em análise, disputa, cancelado).
const ATTEMPT_STATUS = {
  pending: { label: 'Esperando o pagamento', tone: 'warning', icon: FiClock },
  in_process: { label: 'Em análise', tone: 'warning', icon: FiSearch },
  authorized: { label: 'Em análise', tone: 'warning', icon: FiSearch },
  approved: { label: 'Pago', tone: 'good', icon: FiCheckCircle },
  rejected: { label: 'Recusado', tone: 'critical', icon: FiXCircle },
  cancelled: { label: 'Cancelado', tone: 'neutral', icon: FiSlash },
  expired: { label: 'Vencido', tone: 'neutral', icon: FiSlash },
  refunded: { label: 'Estornado', tone: 'serious', icon: FiRotateCcw },
  charged_back: { label: 'Contestado', tone: 'critical', icon: FiAlertTriangle },
  in_mediation: { label: 'Em disputa', tone: 'critical', icon: FiAlertTriangle },
  unknown: { label: 'Conferindo', tone: 'neutral', icon: FiClock },
}

export function AttemptBadge({ status, method }) {
  const base = ATTEMPT_STATUS[status] || { label: 'Situação desconhecida', tone: 'neutral', icon: FiCreditCard }
  // Pix cancelado sem pagar é, na prática, um Pix que venceu.
  const m = status === 'cancelled' && method === 'pix' ? { ...base, label: 'Pix vencido' } : base
  const Icon = m.icon
  return <Badge tone={m.tone} icon={<Icon aria-hidden="true" />}>{m.label}</Badge>
}

// Motivo que o Mercado Pago dá para cada tentativa, em português. O que não
// está aqui não aparece (código técnico não ajuda o dono da loja).
const PAYMENT_DETAIL = {
  accredited: 'dinheiro creditado',
  pending_waiting_transfer: 'esperando o cliente pagar o Pix',
  pending_waiting_payment: 'esperando o cliente pagar',
  pending_contingency: 'o Mercado Pago está processando',
  pending_review_manual: 'em análise manual no Mercado Pago',
  expired: 'o prazo para pagar acabou',
  by_collector: 'cancelado pela loja',
  by_payer: 'cancelado pelo cliente',
  refunded: 'valor devolvido ao cliente',
  partially_refunded: 'parte do valor devolvida',
  cc_rejected_insufficient_amount: 'cartão sem limite',
  cc_rejected_bad_filled_security_code: 'código de segurança errado',
  cc_rejected_bad_filled_date: 'validade do cartão errada',
  cc_rejected_bad_filled_other: 'dados do cartão errados',
  cc_rejected_bad_filled_card_number: 'número do cartão errado',
  cc_rejected_call_for_authorize: 'o banco pediu autorização ao cliente',
  cc_rejected_card_disabled: 'cartão bloqueado',
  cc_rejected_duplicated_payment: 'pagamento repetido',
  cc_rejected_high_risk: 'recusado por segurança',
  cc_rejected_max_attempts: 'tentativas demais',
  cc_rejected_blacklist: 'recusado por segurança',
  cc_rejected_insufficient_data: 'faltaram dados do cliente',
  cc_rejected_other_reason: 'o banco recusou',
  cc_rejected_card_error: 'o cartão deu erro',
  cc_amount_rate_limit_exceeded: 'limite do cartão estourado',
  bank_error: 'erro no banco',
}

export const paymentDetail = (code) => PAYMENT_DETAIL[code] || ''

export function methodText(method, installments) {
  const base = PAYMENT_METHOD[method] || ''
  if (!base) return ''
  return method === 'credit_card' && Number(installments) > 1 ? `${base} em ${installments}x` : base
}

// Texto do botão que leva o pedido ao próximo status...
export const NEXT_ACTION = {
  confirmed: 'Confirmar',
  processing: 'Separar',
  shipped: 'Marcar enviado',
  delivered: 'Marcar entregue',
}

// ...e o aviso depois, com o mesmo verbo do botão.
export const NEXT_DONE = {
  confirmed: 'confirmado',
  processing: 'em separação',
  shipped: 'marcado como enviado',
  delivered: 'marcado como entregue',
}
