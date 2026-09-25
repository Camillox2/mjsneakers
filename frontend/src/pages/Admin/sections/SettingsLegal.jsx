import { useState } from 'react'
import { FiAlertTriangle, FiFileText, FiRotateCcw } from 'react-icons/fi'
import api from '../lib/api'
import { useResource } from '../lib/hooks'
import { date } from '../lib/format'
import { Panel, Button, Segmented, TextField, Badge, useConfirm } from '../ui'
import Markdown from '../../../components/Markdown/Markdown'
import s from './sections.module.css'

// Dados da empresa exigidos numa loja online (Decreto 7.962/2013) e os textos
// legais. Tudo pode ficar em branco e ser preenchido depois: em branco, a loja
// mostra o modelo padrão com os dados que já estiverem aqui.

export const LEGAL_KEYS = [
  'legal_company_name', 'legal_trade_name', 'legal_cnpj', 'legal_address', 'legal_email',
  'legal_phone', 'legal_hours', 'legal_dpo_name', 'legal_dpo_email',
  'page_terms', 'page_returns', 'page_privacy',
]

const PAGES = [
  { key: 'page_terms', api: 'terms', label: 'Termos de uso', path: '/termos' },
  { key: 'page_returns', api: 'returns', label: 'Trocas e devoluções', path: '/trocas-e-devolucoes' },
  { key: 'page_privacy', api: 'privacy', label: 'Privacidade', path: '/privacidade' },
]

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

export function formatCnpj(v) {
  const d = onlyDigits(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function validCnpj(v) {
  const d = onlyDigits(v)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function LegalCompanyPanel({ form, setForm }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const missing = ['legal_company_name', 'legal_cnpj', 'legal_address'].filter(k => !String(form[k] || '').trim())
  const cnpjBad = form.legal_cnpj && !validCnpj(form.legal_cnpj)
  return (
    <Panel title="Dados da empresa" subtitle="rodapé da loja e textos legais">
      <div id="legal" className={s.formGrid}>
        {missing.length > 0 && (
          <p style={{ margin: 0, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--a-warning-wash)', fontSize: 14 }}>
            <FiAlertTriangle aria-hidden="true" style={{ color: 'var(--a-warning)', marginTop: 3, flexShrink: 0 }} />
            A lei do comércio eletrônico (Decreto 7.962/2013) pede razão social, CNPJ e endereço visíveis na loja. Pode preencher depois: o que ficar em branco some do rodapé.
          </p>
        )}
        <div className={s.formRow}>
          <TextField label="Razão social" value={form.legal_company_name || ''} onChange={set('legal_company_name')} placeholder="Nome da empresa no CNPJ" maxLength={160} />
          <TextField label="Nome fantasia" value={form.legal_trade_name || ''} onChange={set('legal_trade_name')} placeholder="Pizantt Drop" maxLength={120} />
        </div>
        <div className={s.formRow}>
          <TextField label="CNPJ" inputMode="numeric" value={formatCnpj(form.legal_cnpj || '')} onChange={e => setForm(f => ({ ...f, legal_cnpj: formatCnpj(e.target.value) }))} placeholder="00.000.000/0000-00" error={cnpjBad ? 'CNPJ não confere. Confira os números.' : undefined} />
          <TextField label="Telefone de atendimento" type="tel" value={form.legal_phone || ''} onChange={set('legal_phone')} />
        </div>
        <TextField label="Endereço completo" value={form.legal_address || ''} onChange={set('legal_address')} placeholder="Rua, número, bairro, cidade, UF, CEP" maxLength={300} />
        <div className={s.formRow}>
          <TextField label="E-mail de atendimento" type="email" value={form.legal_email || ''} onChange={set('legal_email')} />
          <TextField label="Horário de atendimento" value={form.legal_hours || ''} onChange={set('legal_hours')} placeholder="Seg a sex, 9h às 18h" maxLength={120} />
        </div>
        <p className={s.sectionHint} style={{ margin: '6px 0 0' }}>Encarregado de dados (LGPD): a pessoa que responde aos pedidos dos clientes sobre dados pessoais. Pode ser você.</p>
        <div className={s.formRow}>
          <TextField label="Nome do encarregado" value={form.legal_dpo_name || ''} onChange={set('legal_dpo_name')} maxLength={120} />
          <TextField label="E-mail do encarregado" type="email" value={form.legal_dpo_email || ''} onChange={set('legal_dpo_email')} />
        </div>
      </div>
    </Panel>
  )
}

export function LegalPagesPanel({ form, setForm }) {
  const confirm = useConfirm()
  const [tab, setTab] = useState('page_terms')
  const [view, setView] = useState('edit')
  const legal = useResource(() => api.get('/legal').then(r => r.data), [])
  const page = PAGES.find(p => p.key === tab)
  const remote = legal.data?.pages?.[page.api]
  const value = form[tab] || ''
  const usingDefault = !value.trim()
  const shown = usingDefault ? remote?.content || '' : value

  const startFromModel = () => setForm(f => ({ ...f, [tab]: remote?.content || '' }))
  const restore = async () => {
    if (!(await confirm({ title: `Voltar ${page.label} para o modelo?`, message: 'O texto que você escreveu some quando salvar. A loja passa a mostrar o modelo padrão.', confirmLabel: 'Voltar ao modelo', tone: 'danger' }))) return
    setForm(f => ({ ...f, [tab]: '' }))
  }

  return (
    <Panel title="Textos legais" subtitle="termos, trocas e privacidade">
      <div className={s.formGrid}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <Segmented label="Texto" value={tab} onChange={setTab} options={PAGES.map(p => ({ value: p.key, label: p.label }))} />
          <Segmented label="Modo" value={view} onChange={setView} options={[{ value: 'edit', label: 'Escrever' }, { value: 'preview', label: 'Ver como fica' }]} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {usingDefault ? <Badge tone="info">Usando o modelo padrão</Badge> : <Badge tone="good">Texto próprio</Badge>}
          {remote?.updated_at && !usingDefault && <span className={s.small} style={{ color: 'var(--a-muted)' }}>Atualizado em {date(remote.updated_at)}</span>}
          <a className={s.linkBtn} href={page.path} target="_blank" rel="noopener noreferrer">Abrir na loja</a>
        </div>
        {view === 'edit' ? (
          <>
            {usingDefault ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <p className={s.small} style={{ margin: 0 }}>A loja mostra um modelo pronto, com os dados da empresa de cima. Para mudar alguma coisa, comece a partir dele.</p>
                <div><Button icon={<FiFileText />} onClick={startFromModel} disabled={!remote?.content}>Editar a partir do modelo</Button></div>
              </div>
            ) : (
              <TextField
                label={page.label}
                multiline
                value={value}
                onChange={e => setForm(f => ({ ...f, [tab]: e.target.value }))}
                maxLength={40000}
                style={{ minHeight: 360, fontSize: 15 }}
                hint="# título, ## subtítulo, - item de lista, **negrito**. Linha em branco separa parágrafos."
              />
            )}
            {!usingDefault && <div><Button variant="ghost" icon={<FiRotateCcw />} onClick={restore}>Voltar ao modelo padrão</Button></div>}
          </>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--a-line)', background: 'var(--a-sunken)' }}>
            {shown ? <Markdown source={shown} /> : <p className={s.muted}>Carregando o modelo.</p>}
          </div>
        )}
        <p className={s.small} style={{ color: 'var(--a-muted)', margin: 0 }}>Os modelos têm a base da lei. Os trechos entre [colchetes] dependem de você; vale uma leitura de um advogado ou contador antes de abrir a loja.</p>
      </div>
    </Panel>
  )
}
