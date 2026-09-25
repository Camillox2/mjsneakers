import { FiClock, FiCheck, FiPackage, FiTruck, FiCheckCircle, FiXCircle } from 'react-icons/fi'
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

export const NEXT_ACTION = {
  confirmed: 'Confirmar',
  processing: 'Separar',
  shipped: 'Marcar enviado',
  delivered: 'Marcar entregue',
}
