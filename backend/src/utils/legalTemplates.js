// Modelos das páginas legais, usados quando o dono ainda não escreveu a sua.
// Markdown simples (# título, ## subtítulo, - lista, **negrito**, parágrafo).
// {{campo}} é trocado pelos dados da empresa na leitura; o que está entre
// [colchetes] depende de decisão do dono e deve ser revisado.

const TERMS = `# Termos de uso

Estes termos valem para as compras feitas em **{{trade_name}}**. Ao comprar, você concorda com eles.

## Quem somos

Em cumprimento ao Decreto nº 7.962/2013, informamos os dados da loja:

- Razão social: **{{company_name}}**
- Nome fantasia: {{trade_name}}
- CNPJ: {{cnpj}}
- Endereço: {{address}}
- E-mail: {{email}}
- Telefone: {{phone}}
- Horário de atendimento: {{hours}}

## Produtos e preços

As fotos e descrições mostram os produtos com a maior fidelidade possível. Os preços valem para compras no site e podem mudar sem aviso, mas o valor confirmado no seu pedido não muda depois de feito.

Promoções e cupons têm regras próprias (validade, valor mínimo e limite de uso), mostradas no momento da compra.

## Pedido e pagamento

O pedido só é confirmado depois que o pagamento é aprovado. O pagamento é processado pelo **Mercado Pago**: a loja não recebe nem guarda os dados do seu cartão.

Pedidos não pagos no prazo (Pix vencido ou pagamento não concluído) são cancelados automaticamente e os produtos voltam ao estoque.

## Entrega

O prazo e o valor do frete aparecem antes de você finalizar a compra e começam a contar a partir da aprovação do pagamento. Você recebe o código de rastreio quando o pedido é enviado.

Confira o endereço antes de concluir. Se a entrega não acontecer por endereço errado ou ausência repetida, [o reenvio pode ser cobrado].

## Trocas, devoluções e arrependimento

As regras estão na página **Trocas e devoluções**. Você pode desistir da compra em até 7 dias corridos do recebimento, conforme o art. 49 do Código de Defesa do Consumidor.

## Conta e pontos

A conta é acessada com um código enviado ao seu e-mail, sem senha. Os pontos do programa de fidelidade não têm valor em dinheiro, não podem ser transferidos e seguem as regras mostradas na sua conta.

## Atendimento

Fale com a gente pelo e-mail {{email}} ou pelo telefone {{phone}}, no horário {{hours}}. Respondemos em até [2 dias úteis].

## Foro

Fica eleito o foro do domicílio do consumidor para resolver qualquer questão sobre estes termos.
`;

const RETURNS = `# Trocas e devoluções

Queremos que você fique satisfeito com a compra. Estas são as regras de troca e devolução de **{{trade_name}}**.

## Direito de arrependimento (7 dias)

Pelo art. 49 do Código de Defesa do Consumidor, você pode desistir da compra em até **7 dias corridos** contados do recebimento, sem precisar dar motivo.

- O produto deve voltar sem sinais de uso, com etiquetas e na embalagem original.
- O frete da devolução por arrependimento é por nossa conta.
- O reembolso é integral, incluindo o frete pago na compra.

## Produto com defeito

Produtos com defeito podem ser trocados ou devolvidos:

- em até **90 dias** do recebimento, para defeito de fabricação (art. 26 do CDC);
- avaliamos o produto e resolvemos em até **30 dias** (art. 18 do CDC): troca, devolução do dinheiro ou abatimento no preço, à sua escolha.

## Troca de tamanho

Aceitamos troca de tamanho em até [30 dias] do recebimento, sujeita a estoque, com o produto sem uso e na embalagem original. [O frete da troca de tamanho é por conta do cliente.]

## Como pedir

1. Escreva para {{email}} com o número do pedido e o motivo.
2. Enviamos as instruções e o código de postagem.
3. Quando o produto chegar, conferimos e seguimos com a troca ou o reembolso.

## Reembolso

O reembolso é feito pelo **Mercado Pago**, no mesmo meio de pagamento:

- Pix: devolução para a conta de origem;
- cartão de crédito: estorno na fatura, que pode aparecer em até duas faturas, conforme o banco.

Iniciamos o reembolso em até [5 dias úteis] depois de receber e conferir o produto.

## Contato

{{company_name}}, CNPJ {{cnpj}}. E-mail: {{email}}. Telefone: {{phone}}. Horário: {{hours}}.
`;

const PRIVACY = `# Política de privacidade

Esta política explica como **{{company_name}}** ("{{trade_name}}"), CNPJ {{cnpj}}, trata os seus dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).

## Quais dados coletamos

- **Cadastro e pedido:** nome, e-mail, telefone e endereço de entrega.
- **CPF:** pedido só no pagamento por Pix, repassado ao Mercado Pago para gerar o pagamento. **Não guardamos o seu CPF.**
- **Pagamento:** os dados do cartão e do pagamento ficam com o Mercado Pago. Guardamos só a situação do pagamento, a forma, o valor e o número de parcelas.
- **Conta e fidelidade:** histórico de pedidos, pontos, cupons e lista de favoritos.
- **Atendimento:** mensagens trocadas no chat e pedidos de "avise-me" quando o produto voltar.
- **Navegação:** endereço IP e dados técnicos necessários para segurança e prevenção de fraude.

## Para que usamos e com qual base legal

- Processar, entregar e dar suporte ao seu pedido (**execução de contrato**, art. 7º, V).
- Emitir nota fiscal e cumprir obrigações fiscais (**obrigação legal**, art. 7º, II).
- Prevenir fraudes e proteger a loja e você (**legítimo interesse**, art. 7º, IX, e art. 11, II, "g").
- Enviar novidades e cupons por e-mail, só se você pedir (**consentimento**, art. 7º, I), que pode ser retirado a qualquer momento.
- Programa de pontos da sua conta (**execução de contrato**).

## Com quem compartilhamos

Compartilhamos só o necessário com:

- **Mercado Pago:** processamento do pagamento (Pix e cartão);
- **transportadora** [nome]: entrega do pedido;
- **serviço de envio de e-mail** [nome]: códigos de acesso, confirmação e rastreio;
- **Cloudflare Turnstile:** verificação contra robôs nos formulários;
- **Google Gemini:** respostas do chat automático (não envie dados pessoais no chat automático);
- **hospedagem** [nome do provedor]: servidores onde a loja funciona.

Não vendemos os seus dados.

## Armazenamento no seu navegador

Usamos o armazenamento local do navegador para guardar a sacola, os favoritos e preferências de exibição, e cookies necessários para manter a sua sessão e proteger os formulários. Você pode apagar esses dados nas configurações do navegador.

## Por quanto tempo guardamos

- Dados de pedidos e notas fiscais: **5 anos**, pelo prazo da legislação fiscal.
- Conta, pontos e favoritos: enquanto a conta existir.
- Newsletter: até você cancelar a inscrição.
- Conversas de atendimento: [12 meses].

Depois disso, os dados são apagados ou anonimizados.

## Seus direitos (art. 18 da LGPD)

Você pode pedir, a qualquer momento:

- confirmação de que tratamos os seus dados e acesso a eles;
- correção de dados incompletos ou errados;
- anonimização, bloqueio ou exclusão de dados desnecessários;
- portabilidade;
- exclusão dos dados tratados com o seu consentimento;
- informação sobre com quem compartilhamos;
- revogação do consentimento.

Faça o pedido na página **/meus-dados**. Confirmamos o seu e-mail com um código e respondemos em até [15 dias]. Dados com obrigação legal de guarda (como os da nota fiscal) são mantidos pelo prazo da lei.

## Encarregado (DPO)

O encarregado pelo tratamento de dados é **{{dpo_name}}**, pelo e-mail {{dpo_email}}.

## Segurança

Usamos conexão segura, controle de acesso com verificação em duas etapas no painel e registro das ações administrativas.

## Mudanças nesta política

Podemos atualizar esta política. A data da última atualização aparece nesta página.
`;

const TEMPLATES = { terms: TERMS, returns: RETURNS, privacy: PRIVACY };

// Troca {{campo}} pelos dados da empresa; o que faltar vira [campo a preencher].
function fillTemplate(text, company) {
  const values = {
    company_name: company.company_name,
    trade_name: company.trade_name || company.company_name,
    cnpj: company.cnpj,
    address: company.address,
    email: company.email,
    phone: company.phone,
    hours: company.hours,
    dpo_name: company.dpo_name,
    dpo_email: company.dpo_email || company.email,
  };
  const labels = {
    company_name: 'razão social', trade_name: 'nome fantasia', cnpj: 'CNPJ', address: 'endereço', email: 'e-mail',
    phone: 'telefone', hours: 'horário de atendimento', dpo_name: 'nome do encarregado', dpo_email: 'e-mail do encarregado',
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => (values[key] ? values[key] : `[${labels[key] || key}]`));
}

module.exports = { TEMPLATES, fillTemplate };
