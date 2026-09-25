import { Panel, EmptyState, ButtonLink } from '../ui'
import { EmptyRun } from '../art/Art'

export default function NotFound() {
  return (
    <Panel>
      <EmptyState art={<EmptyRun />} title="Esta página do painel não existe" action={<ButtonLink to="/admin" variant="primary">Voltar ao início</ButtonLink>}>
        O endereço pode ter mudado. Use o menu para achar a seção.
      </EmptyState>
    </Panel>
  )
}
