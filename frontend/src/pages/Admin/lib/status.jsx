import { FiClock, FiCheck, FiPackage, FiTruck, FiCheckCircle, FiXCircle, FiCreditCard, FiRotateCcw, FiAlertTriangle, FiSlash } from 'react-icons/fi'
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

// Situação do pagamento (Mercado Pago). "unpaid" = ainda não tentou pagar.
export const PAYMENT_STATUS = {
  unpaid: { label: 'Sem pagamento', tone: 'neutral', icon: FiClock },
  pending: { label: 'Aguardando pagamento', tone: 'warning', icon: FiClock },
  approved: { label: 'Pago', tone: 'good', icon: FiCheckCircle },
  rejected: { label: 'Recusado', tone: 'critical', icon: FiXCircle },
  expired: { label: 'Pix vencido', tone: 'neutral', icon: FiSlash },
  refunded: { label: 'Estornado', tone: 'serious', icon: FiRotateCcw },
  charged_back: { label: 'Contestado', tone: 'critical', icon: FiAlertTriangle },
}

export const PAYMENT_METHOD = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito' }

export function PaymentBadge({ status }) {
  if (!status) return null
  const m = PAYMENT_STATUS[status] || { label: status, tone: 'neutral', icon: FiCreditCard }
  const Icon = m.icon
  return <Badge tone={m.tone} icon={<Icon aria-hidden="true" />}>{m.label}</Badge>
}

export function methodText(method, installments) {
  const base = PAYMENT_METHOD[method] || ''
  if (!base) return ''
  return method === 'credit_card' && Number(installments) > 1 ? `${base} em ${installments}x` : base
}

export const NEXT_ACTION = {
  confirmed: 'Confirmar',
  processing: 'Separar',
  shipped: 'Marcar enviado',
  delivered: 'Marcar entregue',
}
