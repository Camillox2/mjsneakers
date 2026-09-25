import { FiAlertTriangle } from 'react-icons/fi'
import api from '../lib/api'
import { useResource } from '../lib/hooks'
import { Panel, TextField, SelectField, Switch, Badge } from '../ui'
import s from './sections.module.css'
import cf from './Settings.module.css'

// Configuração da nota fiscal eletrônica (NF-e). O token do emissor fica no
// servidor; aqui ficam as escolhas fiscais, que o contador precisa confirmar.

export const FISCAL_KEYS = [
  'fiscal_enabled', 'fiscal_auto_emit', 'fiscal_ie', 'fiscal_uf', 'fiscal_regime', 'fiscal_cfop_state', 'fiscal_cfop_interstate',
  'fiscal_nature', 'fiscal_default_ncm', 'fiscal_default_origin', 'fiscal_icms_cst', 'fiscal_pis_cst', 'fiscal_cofins_cst', 'fiscal_series',
]

export const ORIGINS = [
  { value: '0', label: '0: Nacional' },
  { value: '1', label: '1: Estrangeira, importação direta' },
  { value: '2', label: '2: Estrangeira, comprada no Brasil' },
  { value: '3', label: '3: Nacional, 40% a 70% importado' },
  { value: '4', label: '4: Nacional, processo produtivo básico' },
  { value: '5', label: '5: Nacional, até 40% importado' },
  { value: '6', label: '6: Estrangeira direta, sem similar nacional' },
  { value: '7', label: '7: Estrangeira comprada no Brasil, sem similar' },
  { value: '8', label: '8: Nacional, mais de 70% importado' },
]

// Só os dois regimes que o servidor aceita e que a emissão trata hoje.
const REGIMES = [
  { value: '1', label: 'Simples Nacional' },
  { value: '3', label: 'Regime normal (Lucro Presumido ou Real)' },
]

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

// O que a emissão exige antes da primeira nota (a mesma lista do servidor).
const REQUIRED = [
  ['legal_cnpj', 'CNPJ (em Dados da empresa)'],
  ['fiscal_ie', 'inscrição estadual'],
  ['fiscal_regime', 'regime tributário'],
  ['fiscal_uf', 'UF da empresa'],
  ['fiscal_icms_cst', 'ICMS'],
  ['fiscal_pis_cst', 'PIS'],
  ['fiscal_cofins_cst', 'COFINS'],
]

export const formatNcm = (v) => String(v || '').replace(/\D/g, '').slice(0, 8).replace(/^(\d{4})(\d)/, '$1.$2').replace(/^(\d{4})\.(\d{2})(\d)/, '$1.$2.$3')

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '')
const ieOf = (v) => {
  const text = String(v ?? '').trim().toUpperCase()
  return text === 'ISENTO' ? text : onlyDigits(text)
}

// Valor no formato que o servidor grava: pontos e traços saem (o servidor
// recusa "5.102" ou "6404.11.00" e devolvia um erro com o nome técnico da chave).
export function normalizeFiscal(key, value) {
  if (key === 'fiscal_ie') return ieOf(value)
  if (['fiscal_cfop_state', 'fiscal_cfop_interstate', 'fiscal_default_ncm', 'fiscal_icms_cst', 'fiscal_pis_cst', 'fiscal_cofins_cst', 'fiscal_series'].includes(key)) return onlyDigits(value)
  return value
}

// As mesmas regras do servidor, com a mensagem no campo.
export function fiscalErrors(f) {
  const e = {}
  const filled = (k) => String(f[k] ?? '').trim() !== ''
  if (filled('fiscal_ie') && !/^(ISENTO|\d{2,14})$/.test(ieOf(f.fiscal_ie))) e.fiscal_ie = 'Só números (de 2 a 14) ou a palavra ISENTO.'
  if (filled('fiscal_series') && !/^\d{1,3}$/.test(onlyDigits(f.fiscal_series))) e.fiscal_series = 'De 1 a 3 números.'
  if (filled('fiscal_cfop_state') && onlyDigits(f.fiscal_cfop_state).length !== 4) e.fiscal_cfop_state = 'O CFOP tem 4 números, ex.: 5102.'
  if (filled('fiscal_cfop_interstate') && onlyDigits(f.fiscal_cfop_interstate).length !== 4) e.fiscal_cfop_interstate = 'O CFOP tem 4 números, ex.: 6102.'
  if (filled('fiscal_default_ncm') && onlyDigits(f.fiscal_default_ncm).length !== 8) e.fiscal_default_ncm = 'O NCM tem 8 números.'
  if (filled('fiscal_icms_cst') && !/^\d{2,3}$/.test(onlyDigits(f.fiscal_icms_cst))) e.fiscal_icms_cst = 'De 2 a 3 números, ex.: 102.'
  if (filled('fiscal_pis_cst') && onlyDigits(f.fiscal_pis_cst).length !== 2) e.fiscal_pis_cst = 'O CST tem 2 números.'
  if (filled('fiscal_cofins_cst') && onlyDigits(f.fiscal_cofins_cst).length !== 2) e.fiscal_cofins_cst = 'O CST tem 2 números.'
  if (filled('fiscal_regime') && !REGIMES.some(r => r.value === f.fiscal_regime)) e.fiscal_regime = 'Escolha um dos regimes da lista.'
  return e
}

export default function SettingsFiscal({ form, setForm, errors = {}, locked }) {
  const cfg = useResource(() => api.get('/invoices/config').then(r => r.data), [])
  const c = cfg.data
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const on = form.fiscal_enabled === 'true'
  const missing = REQUIRED.filter(([k]) => !String(form[k] ?? '').trim()).map(([, label]) => label)
  if (!String(form.fiscal_default_ncm ?? '').trim()) missing.push('NCM padrão (ou o NCM em cada produto)')

  return (
    <Panel title="Nota fiscal" subtitle="NF-e">
      <div className={s.formGrid}>
        <div className={cf.row}>
          {cfg.error ? <Badge tone="neutral">Não deu para ler o emissor agora</Badge>
            : c?.has_token ? <Badge tone="good">Emissor conectado</Badge>
              : c && <Badge tone="warning">Emissor não conectado no servidor</Badge>}
          {c?.env && <Badge tone={c.env === 'producao' ? 'info' : 'warning'}>{c.env === 'producao' ? 'Produção (notas valendo)' : 'Homologação (teste)'}</Badge>}
        </div>
        {c && !c.has_token && (
          <p className={cf.note}>
            O emissor usado é o Focus NFe. Crie a conta, suba o certificado digital A1 da empresa lá e peça para colocarem no servidor FOCUSNFE_TOKEN e FOCUSNFE_ENV (homologacao para testar, producao para valer).
          </p>
        )}
        {locked && (
          <p className={cf.warn} role="note">
            <FiAlertTriangle aria-hidden="true" />
            Para mudar a nota fiscal, ligue a verificação em duas etapas na sua conta (em Equipe).
          </p>
        )}
        <fieldset className={cf.lockable} disabled={locked}>
          <Switch checked={on} disabled={locked} onChange={v => setForm(f => ({ ...f, fiscal_enabled: v ? 'true' : 'false' }))} label="Emitir nota fiscal pela loja" description="Desligado, o botão de emitir nota some dos pedidos." />
          <Switch checked={form.fiscal_auto_emit === 'true'} disabled={locked || !on} onChange={v => setForm(f => ({ ...f, fiscal_auto_emit: v ? 'true' : 'false' }))} label="Emitir sozinho quando o pagamento aprovar" description="Deixe desligado até testar algumas notas em homologação." />
          {on && missing.length > 0 && (
            <p className={cf.warn} role="status">
              <FiAlertTriangle aria-hidden="true" />
              Para emitir, falta: {missing.join(', ')}.
            </p>
          )}
          <div className={s.formRow}>
            <SelectField label="Regime tributário" placeholder="Escolha" value={form.fiscal_regime || ''} onChange={set('fiscal_regime')} options={REGIMES} error={errors.fiscal_regime} hint="MEI ou Simples acima do sublimite: fale com o contador antes de emitir." />
            <TextField label="Inscrição estadual" value={form.fiscal_ie || ''} onChange={set('fiscal_ie')} error={errors.fiscal_ie} placeholder="Só números, ou ISENTO" autoCapitalize="characters" maxLength={20} />
            <SelectField label="UF da empresa" placeholder="Escolha" value={form.fiscal_uf || ''} onChange={set('fiscal_uf')} options={UFS.map(u => ({ value: u, label: u }))} hint="Decide o CFOP de dentro ou de fora do estado." />
            <TextField label="Série da nota" inputMode="numeric" value={form.fiscal_series || ''} onChange={set('fiscal_series')} error={errors.fiscal_series} placeholder="1" maxLength={3} />
          </div>
          <div className={s.formRow}>
            <TextField label="Natureza da operação" value={form.fiscal_nature || ''} onChange={set('fiscal_nature')} placeholder="Venda de mercadoria" maxLength={60} hint="Vazio: Venda de mercadoria." />
            <TextField label="CFOP dentro do estado" inputMode="numeric" value={form.fiscal_cfop_state || ''} onChange={set('fiscal_cfop_state')} error={errors.fiscal_cfop_state} placeholder="5102" maxLength={5} hint="Vazio: 5102." />
            <TextField label="CFOP para outro estado" inputMode="numeric" value={form.fiscal_cfop_interstate || ''} onChange={set('fiscal_cfop_interstate')} error={errors.fiscal_cfop_interstate} placeholder="6102" maxLength={5} hint="Vazio: 6102." />
          </div>
          <div className={s.formRow}>
            <TextField
              label="NCM padrão dos produtos"
              inputMode="numeric"
              value={formatNcm(form.fiscal_default_ncm || '')}
              onChange={e => setForm(f => ({ ...f, fiscal_default_ncm: onlyDigits(e.target.value).slice(0, 8) }))}
              error={errors.fiscal_default_ncm}
              placeholder="0000.00.00"
              hint="Vale para produto sem NCM próprio."
            />
            <SelectField label="Origem padrão" value={form.fiscal_default_origin || '0'} onChange={set('fiscal_default_origin')} options={ORIGINS} />
          </div>
          <div className={s.formRow}>
            <TextField label="ICMS (CST ou CSOSN)" inputMode="numeric" value={form.fiscal_icms_cst || ''} onChange={set('fiscal_icms_cst')} error={errors.fiscal_icms_cst} placeholder="Ex.: 102 no Simples" maxLength={3} />
            <TextField label="PIS (CST)" inputMode="numeric" value={form.fiscal_pis_cst || ''} onChange={set('fiscal_pis_cst')} error={errors.fiscal_pis_cst} maxLength={2} />
            <TextField label="COFINS (CST)" inputMode="numeric" value={form.fiscal_cofins_cst || ''} onChange={set('fiscal_cofins_cst')} error={errors.fiscal_cofins_cst} maxLength={2} />
          </div>
        </fieldset>
        <p className={cf.warn}>
          <FiAlertTriangle aria-hidden="true" />
          Confirme cada campo com o seu contador antes de emitir em produção: imposto errado vira multa.
        </p>
      </div>
    </Panel>
  )
}
