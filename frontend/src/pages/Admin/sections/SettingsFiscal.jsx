import api from '../lib/api'
import { useResource } from '../lib/hooks'
import { Panel, TextField, SelectField, Switch, Badge } from '../ui'
import s from './sections.module.css'

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

const REGIMES = [
  { value: '1', label: 'Simples Nacional' },
  { value: '4', label: 'Simples Nacional, MEI' },
  { value: '2', label: 'Simples Nacional, acima do sublimite' },
  { value: '3', label: 'Regime normal (Lucro Presumido ou Real)' },
]

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export const formatNcm = (v) => String(v || '').replace(/\D/g, '').slice(0, 8).replace(/^(\d{4})(\d)/, '$1.$2').replace(/^(\d{4})\.(\d{2})(\d)/, '$1.$2.$3')

export default function SettingsFiscal({ form, setForm }) {
  const cfg = useResource(() => api.get('/invoices/config').then(r => r.data).catch(() => null), [])
  const c = cfg.data
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const on = form.fiscal_enabled === 'true'
  return (
    <Panel title="Nota fiscal" subtitle="NF-e">
      <div className={s.formGrid}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {c?.has_token ? <Badge tone="good">Emissor conectado</Badge> : <Badge tone="warning">Emissor sem token no servidor</Badge>}
          {c?.env && <Badge tone={c.env === 'producao' ? 'info' : 'warning'}>{c.env === 'producao' ? 'Produção' : 'Homologação (teste)'}</Badge>}
        </div>
        {!c?.has_token && (
          <p className={s.small} style={{ margin: 0, color: 'var(--a-muted)' }}>
            O emissor usado é o Focus NFe. Crie a conta, suba o certificado digital A1 da empresa lá e coloque no servidor FOCUSNFE_TOKEN e FOCUSNFE_ENV (homologacao para testar, producao para valer).
          </p>
        )}
        <Switch checked={on} onChange={v => setForm(f => ({ ...f, fiscal_enabled: v ? 'true' : 'false' }))} label="Emitir nota fiscal pela loja" description="Desligado, o botão de emitir nota some dos pedidos." />
        <Switch checked={form.fiscal_auto_emit === 'true'} disabled={!on} onChange={v => setForm(f => ({ ...f, fiscal_auto_emit: v ? 'true' : 'false' }))} label="Emitir sozinho quando o pagamento aprovar" description="Deixe desligado até testar algumas notas em homologação." />
        <div className={s.formRow}>
          <SelectField label="Regime tributário" placeholder="Escolha" value={form.fiscal_regime || ''} onChange={set('fiscal_regime')} options={REGIMES} />
          <TextField label="Inscrição estadual" value={form.fiscal_ie || ''} onChange={set('fiscal_ie')} placeholder="Só números, ou ISENTO" />
          <SelectField label="UF da empresa" placeholder="Escolha" value={form.fiscal_uf || ''} onChange={set('fiscal_uf')} options={UFS.map(u => ({ value: u, label: u }))} hint="Decide o CFOP de dentro ou de fora do estado." />
          <TextField label="Série da nota" inputMode="numeric" value={form.fiscal_series || ''} onChange={set('fiscal_series')} placeholder="1" />
        </div>
        <div className={s.formRow}>
          <TextField label="Natureza da operação" value={form.fiscal_nature || ''} onChange={set('fiscal_nature')} placeholder="Venda de mercadoria" />
          <TextField label="CFOP dentro do estado" inputMode="numeric" value={form.fiscal_cfop_state || ''} onChange={set('fiscal_cfop_state')} placeholder="5102" />
          <TextField label="CFOP para outro estado" inputMode="numeric" value={form.fiscal_cfop_interstate || ''} onChange={set('fiscal_cfop_interstate')} placeholder="6102" />
        </div>
        <div className={s.formRow}>
          <TextField label="NCM padrão dos produtos" inputMode="numeric" value={formatNcm(form.fiscal_default_ncm || '')} onChange={e => setForm(f => ({ ...f, fiscal_default_ncm: formatNcm(e.target.value) }))} placeholder="0000.00.00" hint="Vale para produto sem NCM próprio." />
          <SelectField label="Origem padrão" value={form.fiscal_default_origin || '0'} onChange={set('fiscal_default_origin')} options={ORIGINS} />
        </div>
        <div className={s.formRow}>
          <TextField label="ICMS (CST ou CSOSN)" inputMode="numeric" value={form.fiscal_icms_cst || ''} onChange={set('fiscal_icms_cst')} placeholder="Ex.: 102 no Simples" />
          <TextField label="PIS (CST)" inputMode="numeric" value={form.fiscal_pis_cst || ''} onChange={set('fiscal_pis_cst')} />
          <TextField label="COFINS (CST)" inputMode="numeric" value={form.fiscal_cofins_cst || ''} onChange={set('fiscal_cofins_cst')} />
        </div>
        <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--a-warning-wash)', fontSize: 14 }}>
          Confirme cada campo com o seu contador antes de emitir em produção: imposto errado vira multa. Mudar esta configuração exige a verificação em duas etapas ligada.
        </p>
      </div>
    </Panel>
  )
}
