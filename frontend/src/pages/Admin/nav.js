import {
  FiHome, FiShoppingBag, FiUsers, FiPercent, FiGift, FiPackage, FiBox, FiTag, FiStar,
  FiImage, FiZap, FiMail, FiTruck, FiBarChart2, FiShield, FiSettings, FiActivity, FiMessageSquare,
} from 'react-icons/fi'

// Mapa do painel. `badge` aponta para um contador do AdminContext.
export const NAV = [
  { label: null, items: [
    { to: '/admin', label: 'Início', icon: FiHome, end: true },
  ] },
  { label: 'Vendas', items: [
    { to: '/admin/pedidos', label: 'Pedidos', icon: FiShoppingBag, badge: 'pendingOrders' },
    { to: '/admin/conversas', label: 'Conversas', icon: FiMessageSquare, badge: 'unreadChats' },
    { to: '/admin/clientes', label: 'Clientes', icon: FiUsers },
    { to: '/admin/cupons', label: 'Cupons', icon: FiPercent },
    { to: '/admin/fidelidade', label: 'Fidelidade', icon: FiGift },
  ] },
  { label: 'Catálogo', items: [
    { to: '/admin/produtos', label: 'Produtos', icon: FiPackage },
    { to: '/admin/estoque', label: 'Estoque', icon: FiBox },
    { to: '/admin/marcas', label: 'Marcas e categorias', icon: FiTag },
    { to: '/admin/avaliacoes', label: 'Avaliações', icon: FiStar, badge: 'pendingReviews' },
  ] },
  { label: 'Vitrine', items: [
    { to: '/admin/banners', label: 'Banners', icon: FiImage },
    { to: '/admin/vitrine', label: 'Faixa e campanha', icon: FiZap },
    { to: '/admin/newsletter', label: 'Newsletter', icon: FiMail },
  ] },
  { label: 'Operação', items: [
    { to: '/admin/frete', label: 'Frete', icon: FiTruck },
    { to: '/admin/relatorios', label: 'Relatórios', icon: FiBarChart2 },
  ] },
  { label: 'Sistema', items: [
    { to: '/admin/equipe', label: 'Equipe', icon: FiShield },
    { to: '/admin/configuracoes', label: 'Configurações', icon: FiSettings },
    { to: '/admin/atividade', label: 'Atividade', icon: FiActivity },
  ] },
]

export const ALL_ITEMS = NAV.flatMap(g => g.items)

// Os quatro atalhos da barra de baixo no celular (o quinto é "Mais").
export const BOTTOM = ['/admin', '/admin/pedidos', '/admin/produtos', '/admin/estoque']

export function titleFor(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/admin'
  const match = ALL_ITEMS
    .filter(it => (it.end ? clean === it.to : clean === it.to || clean.startsWith(`${it.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return match?.label || 'Painel'
}
