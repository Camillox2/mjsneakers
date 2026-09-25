import { useState } from 'react'
import { FiAlertTriangle, FiFileText, FiRotateCcw, FiExternalLink } from 'react-icons/fi'
import api from '../lib/api'
import { useResource } from '../lib/hooks'
import { date } from '../lib/format'
import { Panel, Button, Segmented, TextField, Badge, ErrorNote, Skeleton, useConfirm } from '../ui'
import Markdown from '../../../components/Markdown/Markdown'
import s from './sections.module.css'
import cf from './Settings.module.css'

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

// Desde julho de 2026 a Receita também emite CNPJ com letras (IN RFB 2.229/2024):
// as 12 primeiras posições aceitam letras e cada caractere vale (código - 48) na
// conta. O servidor já aceitava; o painel só deixava digitar número.
const cleanCnpj = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14)

export function formatCnpj(v) {
  return cleanCnpj(v)
    .replace(/^(\w{2})(\w)/, '$1.$2')
    .replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/\.(\w{3})(\w)/, '.$1/$2')
    .replace(/(\w{4})(\w)/, '$1-$2')
}

export function validCnpj(v) {
  const d = cleanCnpj(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const at = (i) => d.charCodeAt(i) - 48
  const calc = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = w.reduce((acc, wi, i) => acc + at(i) * wi, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function LegalCompanyPanel({ form, setForm, errors = {} }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const missing = ['legal_company_name', 'legal_cnpj', 'legal_address'].filter(k => !String(form[k] || '').trim())
  const cnpjBad = form.legal_cnpj && cleanCnpj(form.legal_cnpj).length === 14 && !validCnpj(form.legal_cnpj)
  return (
    <Panel title="Dados da empresa" subtitle="rodapé da loja, textos legais e nota fiscal">
      <div id="legal" className={s.formGrid}>
        {missing.length > 0 && (
          <p className={cf.warn}>
            <FiAlertTriangle aria-hidden="true" />
            A lei do comércio eletrônico (Decreto 7.962/2013) pede razão social, CNPJ e endereço visíveis na loja. Pode preencher depois: o que ficar em branco some do rodapé.
          </p>
        )}
        <div className={s.formRow}>
          <TextField label="Razão social" value={form.legal_company_name || ''} onChange={set('legal_company_name')} placeholder="Nome da empresa no CNPJ" maxLength={160} />
          <TextField label="Nome fantasia" value={form.legal_trade_name || ''} onChange={set('legal_trade_name')} placeholder="Nome da loja" maxLength={120} />
        </div>
        <div className={s.formRow}>
          <TextField
            label="CNPJ"
            autoCapitalize="characters"
            spellCheck={false}
            value={formatCnpj(form.legal_cnpj || '')}
            onChange={e => setForm(f => ({ ...f, legal_cnpj: formatCnpj(e.target.value) }))}
            placeholder="00.000.000/0000-00"
            error={errors.legal_cnpj || (cnpjBad ? 'CNPJ não confere. Confira os números.' : undefined)}
            hint="Só números ou, no CNPJ novo, letras e números."
          />
          <TextField label="Telefone de atendimento" type="tel" value={form.legal_phone || ''} onChange={set('legal_phone')} maxLength={40} />
        </div>
        <TextField label="Endereço completo" value={form.legal_address || ''} onChange={set('legal_address')} placeholder="Rua, número, bairro, cidade, UF, CEP" maxLength={300} />
        <div className={s.formRow}>
          <TextField label="E-mail de atendimento" type="email" value={form.legal_email || ''} onChange={set('legal_email')} error={errors.legal_email} maxLength={160} />
          <TextField label="Horário de atendimento" value={form.legal_hours || ''} onChange={set('legal_hours')} placeholder="Seg a sex, 9h às 18h" maxLength={120} />
        </div>
        <p className={s.sectionHint}>Encarregado de dados (LGPD): a pessoa que responde aos pedidos dos clientes sobre dados pessoais. Pode ser você.</p>
        <div className={s.formRow}>
          <TextField label="Nome do encarregado" value={form.legal_dpo_name || ''} onChange={set('legal_dpo_name')} maxLength={120} />
          <TextField label="E-mail do encarregado" type="email" value={form.legal_dpo_email || ''} onChange={set('legal_dpo_email')} error={errors.legal_dpo_email} maxLength={160} hint="Vazio: usa o e-mail de atendimento." />
        </div>
      </div>
    </Panel>
  )
}

// version muda a cada salvamento: a prévia busca de novo (a rota tem cache de 5 min).
export function LegalPagesPanel({ form, setForm, version }) {
  const confirm = useConfirm()
  const [tab, setTab] = useState('page_terms')
  const [view, setView] = useState('edit')
  // abas em edição: o campo continua na tela mesmo se o texto for apagado inteiro
  const [editing, setEditing] = useState([])
  const legal = useResource(() => api.get('/legal', { params: { v: version } }).then(r => r.data), [version])
  const page = PAGES.find(p => p.key === tab)
  const remote = legal.data?.pages?.[page.api]
  const value = form[tab] || ''
  const isEditing = !!value.trim() || editing.includes(tab)
  // o servidor ainda tem o texto próprio, mas ele foi apagado aqui: o modelo só volta ao salvar
  const clearedCustom = !value.trim() && remote && !remote.is_default
  const shown = value.trim() ? value : remote?.is_default ? remote.content : ''

  const startFromModel = () => {
    setEditing(list => [...new Set([...list, tab])])
    setForm(f => ({ ...f, [tab]: remote?.content || '' }))
  }
  const restore = async () => {
    if (!(await confirm({ title: `Voltar ${page.label} para o modelo?`, message: 'O texto que você escreveu some quando salvar. A loja passa a mostrar o modelo padrão.', confirmLabel: 'Voltar ao modelo', tone: 'danger' }))) return
    setEditing(list => list.filter(k => k !== tab))
    setForm(f => ({ ...f, [tab]: '' }))
  }

  return (
    <Panel title="Textos legais" subtitle="termos, trocas e privacidade">
      <div className={s.formGrid}>
        <div className={cf.split}>
          <Segmented label="Texto" value={tab} onChange={setTab} options={PAGES.map(p => ({ value: p.key, label: p.label }))} />
          <Segmented label="Modo" value={view} onChange={setView} options={[{ value: 'edit', label: 'Escrever' }, { value: 'preview', label: 'Ver como fica' }]} />
        </div>
        <div className={cf.row}>
          {isEditing ? <Badge tone="good">Texto próprio</Badge> : <Badge tone="info">Usando o modelo padrão</Badge>}
          {remote?.updated_at && !remote.is_default && <span className={cf.updated}>Salvo em {date(remote.updated_at)}</span>}
          <a className={s.linkBtn} href={page.path} target="_blank" rel="noopener noreferrer">Abrir na loja <FiExternalLink aria-hidden="true" /></a>
        </div>
        <ErrorNote error={legal.error} onRetry={legal.reload} />
        {view === 'edit' ? (
          <>
            {isEditing ? (
              <TextField
                className={cf.editor}
                label={page.label}
                multiline
                value={value}
                onChange={e => setForm(f => ({ ...f, [tab]: e.target.value }))}
                maxLength={40000}
                hint={value.trim()
                  ? '# título, ## subtítulo, - item de lista, **negrito**. Linha em branco separa parágrafos. Os dados da empresa ficam escritos aqui: se mudarem, ajuste o texto também.'
                  : 'Vazio: ao salvar, a loja volta a mostrar o modelo padrão.'}
              />
            ) : clearedCustom ? (
              <p className={cf.note}>Ao salvar, a loja volta a mostrar o modelo padrão no lugar do seu texto.</p>
            ) : (
              <div className={s.formGrid}>
                <p className={cf.note}>A loja mostra um modelo pronto, com os dados da empresa de cima. Para mudar alguma coisa, comece a partir dele.</p>
                <div><Button icon={<FiFileText />} onClick={startFromModel} disabled={!remote?.content}>Editar a partir do modelo</Button></div>
              </div>
            )}
            {isEditing && <div><Button variant="ghost" icon={<FiRotateCcw />} onClick={restore}>Voltar ao modelo padrão</Button></div>}
          </>
        ) : (
          <div className={cf.preview}>
            {shown ? <Markdown source={shown} />
              : clearedCustom ? <p className={cf.note}>O modelo padrão aparece aqui depois de salvar.</p>
                : legal.loading ? <Skeleton lines={6} height={16} /> : <p className={cf.note}>Nada para mostrar ainda.</p>}
          </div>
        )}
        <p className={cf.note}>Os modelos têm a base da lei. Os trechos entre [colchetes] dependem de você; vale uma leitura de um advogado ou contador antes de abrir a loja.</p>
      </div>
    </Panel>
  )
}
