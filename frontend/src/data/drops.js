// Os tênis que giram na abertura e os exemplares de amostra da loja.
//
// Cada giro aponta para uma pasta em /public/giros/<id> gerada por
// tools/giros (manifest.json + quadros). Quando o catálogo real entrar,
// preencha `productId` com o id do produto no backend e o botão do giro
// passa a abrir o produto de verdade.

const SIZES = '36,37,38,39,40,41,42,43,44'

// Mundos do giro: fundo, brilho em volta do tênis e cor do texto. A cor de
// cada mundo vem do fundo do próprio vídeo do tênis.
const ALL_DROPS = [
  {
    id: 'jordan-1-low',
    productId: null,
    name: 'Air Jordan 1 Low',
    word: 'Jordan',
    price: 1099,
    line: 'O Chicago em cano baixo: vermelho, branco e preto no couro.',
    specs: [
      ['Cano', 'Baixo'],
      ['Cabedal', 'Couro'],
      ['Cores', 'Chicago'],
    ],
    world: {
      bg: 'radial-gradient(120% 95% at 50% 56%, #2a9a86 0%, #0f5147 46%, #03201c 100%)',
      base: '#0f5147',
      glow: '#8ff0dc',
      ink: '#effffb',
      ink2: 'rgba(239, 255, 251, 0.7)',
      line: 'rgba(200, 255, 240, 0.7)',
    },
    // chamadas do croqui. at = trecho da volta (0 a 1) em que a peça está de
    // frente para a câmera; track = posição da peça nesse trecho, rastreada
    // quadro a quadro por tools/giros/chamadas.py; text = de que lado e a que
    // distância fica o texto (text[0]). A altura sai da própria peça, ajustada
    // no site para o texto não cobrir o nome gigante nem a ficha.
    // Tudo em frações do quadro 4:3.
    callouts: [
      { label: 'Asa Jordan no calcanhar', at: [0.56, 0.68], text: [0.86, 0.3], track: [[0.627,0.557],[0.583,0.559],[0.532,0.56],[0.477,0.56],[0.424,0.56],[0.378,0.559],[0.335,0.558]] },
      { label: 'Swoosh preto em couro', at: [0.8, 0.93], text: [0.12, 0.18], track: [[0.504,0.568],[0.485,0.57],[0.463,0.571],[0.44,0.57],[0.417,0.567],[0.395,0.562],[0.377,0.557]] },
      { label: 'Jumpman na lingueta', at: [0.06, 0.2], text: [0.84, 0.1], track: [[0.448,0.275],[0.456,0.273],[0.469,0.271],[0.485,0.27],[0.496,0.269],[0.505,0.269],[0.512,0.27]] },
    ],
  },
  {
    id: 'nike-dunk-panda',
    productId: null,
    name: 'Nike Dunk Low Panda',
    word: 'Dunk',
    price: 999,
    line: 'Preto e branco, sem erro: o Dunk que combina com tudo.',
    specs: [
      ['Cano', 'Baixo'],
      ['Cabedal', 'Couro'],
      ['Sola', 'Cupsole'],
    ],
    // o vídeo do Dunk muda de zoom e ângulo na segunda volta, então a volta
    // fecha com um corte seco (sem quadro inventado). Esta fase joga o corte
    // para quando o tênis está entrando (invisível) e saindo de cena, fora do
    // trecho em que ele fica parado com as chamadas.
    phase: -0.07,
    world: {
      bg: 'radial-gradient(120% 95% at 50% 56%, #fff1a8 0%, #f2c230 50%, #b8870f 100%)',
      base: '#f2c230',
      glow: '#fff3b0',
      // no mundo claro o nome enche de grafite, não de cromo
      nameFill: 'linear-gradient(180deg, #5b6069 0%, #16181c 45%, #3a3e45 62%, #0b0c0e 100%)',
      ink: '#16130a',
      logoInv: 1, // logo cromado fica escuro no mundo claro
      ink2: 'rgba(22, 19, 10, 0.66)',
      line: 'rgba(22, 19, 10, 0.55)',
    },
    callouts: [
      { label: 'Nike bordado no calcanhar', at: [0.44, 0.56], text: [0.08, 0.16], track: [[0.372,0.375],[0.339,0.374],[0.306,0.372],[0.275,0.37],[0.245,0.368],[0.218,0.365],[0.195,0.361]] },
      { label: 'Swoosh em couro preto', at: [0.6, 0.72], text: [0.9, 0.3], track: [[0.536,0.52],[0.512,0.518],[0.489,0.514],[0.468,0.51],[0.449,0.505],[0.431,0.5],[0.416,0.5]] },
      { label: 'Biqueira perfurada', at: [0.84, 0.96], text: [0.86, 0.8], track: [[0.591,0.595],[0.555,0.595],[0.518,0.598],[0.482,0.6],[0.447,0.602],[0.413,0.603],[0.383,0.6]] },
    ],
  },
  {
    id: 'adidas-samba',
    // o vídeo atual gira só ~200 graus e termina com emenda: fica fora do giro
    // até chegar um vídeo com a volta completa (continua na loja)
    pending: true,
    productId: null,
    name: 'Adidas Samba OG',
    word: 'Samba',
    price: 799,
    line: 'Três listras, biqueira em T e sola de borracha gum.',
    specs: [
      ['Cabedal', 'Couro'],
      ['Biqueira', 'Camurça'],
      ['Sola', 'Gum'],
    ],
    world: {
      bg: 'radial-gradient(120% 95% at 50% 56%, #7c4ce0 0%, #3b1d8f 48%, #120733 100%)',
      base: '#3b1d8f',
      glow: '#c9b4ff',
      ink: '#f5f0ff',
      ink2: 'rgba(245, 240, 255, 0.7)',
      line: 'rgba(225, 212, 255, 0.72)',
    },
    callouts: [],
  },
  {
    id: 'puma-suede',
    productId: null,
    name: 'Puma Suede Classic',
    word: 'Suede',
    price: 549,
    line: 'Camurça marinho e a formstrip branca de ponta a ponta.',
    specs: [
      ['Cabedal', 'Camurça'],
      ['Faixa', 'Formstrip'],
      ['Sola', 'Borracha'],
    ],
    world: {
      bg: 'radial-gradient(120% 95% at 50% 56%, #d4661f 0%, #8a3409 48%, #2b0e02 100%)',
      base: '#8a3409',
      glow: '#ffb27a',
      ink: '#fff5ee',
      ink2: 'rgba(255, 245, 238, 0.7)',
      line: 'rgba(255, 220, 196, 0.72)',
    },
    callouts: [
      { label: 'Logo Puma no calcanhar', at: [0.38, 0.5], text: [0.84, 0.16], track: [[0.604,0.373],[0.555,0.373],[0.502,0.372],[0.451,0.37],[0.404,0.37],[0.36,0.369],[0.32,0.368]] },
      { label: 'Formstrip branca', at: [0.6, 0.72], text: [0.12, 0.2], track: [[0.495,0.533],[0.472,0.533],[0.447,0.532],[0.42,0.53],[0.396,0.526],[0.376,0.522],[0.363,0.519]] },
      { label: 'Cadarço branco grosso', at: [0.84, 0.96], text: [0.86, 0.12], track: [[0.498,0.361],[0.5,0.36],[0.503,0.36],[0.5,0.36],[0.498,0.36],[0.494,0.361],[0.492,0.362]] },
    ],
  },
]

export const DROPS = ALL_DROPS.filter((d) => !d.pending)

const frame = (id, n) => `/giros/${id}/d/${String(n).padStart(3, '0')}.webp`

// Formato igual ao que o backend devolve em /products, para os mesmos
// componentes (card, modal, sacola) funcionarem com amostra ou produto real.
// `angles` são os quadros do giro usados na galeria (lado, frente, costas).
function sample({ id, name, brand, price, glow, description, angles = [], ...rest }) {
  const [side, front, back] = angles
  return {
    id: `amostra-${id}`,
    sample: true,
    spin: id,
    fit: 'contain',
    glow,
    name,
    brand_name: brand,
    price,
    discount_percentage: 0,
    stock: 8,
    sizes: SIZES,
    description,
    image_url: frame(id, 0),
    ...(side !== undefined && { image_url_2: frame(id, side) }),
    ...(front !== undefined && { image_url_3: frame(id, front) }),
    ...(back !== undefined && { image_url_4: frame(id, back) }),
    ...rest,
  }
}

export const SAMPLE_PRODUCTS = [
  sample({
    id: 'jordan-1-low',
    angles: [259, 49, 151],
    name: 'Air Jordan 1 Low',
    brand: 'Jordan',
    price: 1099,
    glow: '#2fbfa6',
    description: 'Vermelho, branco e preto no couro, swoosh preto e a asa Jordan no calcanhar. O clássico das quadras para usar todo dia.',
    created_at: '2026-09-22',
  }),
  sample({
    id: 'nike-dunk-panda',
    angles: [119, 150, 72],
    name: 'Nike Dunk Low Panda',
    brand: 'Nike',
    price: 999,
    glow: '#f2c230',
    description: 'O Dunk Low no bicolor mais pedido: base branca, sobreposições pretas em couro e sola cupsole de borracha.',
    discount_percentage: 10,
    promo_end: new Date(Date.now() + 3 * 864e5).toISOString(),
    created_at: '2026-09-21',
  }),
  sample({
    id: 'adidas-samba',
    name: 'Adidas Samba OG',
    brand: 'Adidas',
    price: 799,
    glow: '#8a5cf0',
    description: 'Couro branco, listras pretas, biqueira em T de camurça e a sola de borracha gum que nasceu nas quadras de futsal.',
    created_at: '2026-09-20',
  }),
  sample({
    id: 'nike-af1',
    angles: [36, undefined, 83],
    name: "Nike Air Force 1 '07",
    brand: 'Nike',
    price: 799,
    glow: '#3d7bff',
    description: 'Todo branco: couro liso, perfurações na biqueira e o amortecimento Air escondido na entressola. Combina com tudo.',
    created_at: '2026-09-19',
  }),
  sample({
    id: 'nb-550',
    angles: [57, 31, 97],
    name: 'New Balance 550',
    brand: 'New Balance',
    price: 899,
    glow: '#ff7fa0',
    stock: 2,
    description: 'Basquete dos anos 80: couro branco com detalhes em verde, o N lateral e a sola baixa. Leve, firme e fácil de combinar.',
    created_at: '2026-09-18',
  }),
  sample({
    id: 'puma-suede',
    angles: [121, 163, 86],
    name: 'Puma Suede Classic',
    brand: 'Puma',
    price: 549,
    glow: '#ff8a2a',
    description: 'Camurça marinho macia, a formstrip branca e a sola de borracha fina. Um clássico que nunca saiu de cena.',
    created_at: '2026-09-17',
  }),
  // fotos reais da loja (seção "No pé"); não entram na grade da vitrine
  {
    id: 'amostra-skate-lavanda',
    sample: true,
    grid: false,
    fit: 'cover',
    glow: '#b89af0',
    name: 'Skate Lavanda',
    brand_name: 'Pizantt',
    price: 1290,
    discount_percentage: 0,
    stock: 5,
    sizes: '38,39,40,41,42,43',
    description: 'Cano baixo acolchoado, cadarço grosso e cabedal em camadas de lavanda. Foto real, no pé.',
    image_url: '/amostras/skate-lavanda-lado.webp',
    image_url_2: '/amostras/skate-lavanda-frente.webp',
    image_url_3: '/amostras/skate-lavanda-tras.webp',
    created_at: '2026-09-10',
  },
  {
    id: 'amostra-skate-oceano',
    sample: true,
    grid: false,
    fit: 'cover',
    glow: '#86a6ff',
    name: 'Skate Oceano',
    brand_name: 'Pizantt',
    price: 1290,
    discount_percentage: 0,
    stock: 3,
    sizes: '38,39,40,41,42,43',
    description: 'O mesmo cano baixo em três azuis, do marinho ao céu. Foto real, no pé.',
    image_url: '/amostras/skate-oceano-lado.webp',
    image_url_2: '/amostras/skate-oceano-frente.webp',
    image_url_3: '/amostras/skate-oceano-tras.webp',
    created_at: '2026-09-08',
  },
]

export const GRID_SAMPLES = SAMPLE_PRODUCTS.filter((p) => p.grid !== false)

export const isSample = (product) => Boolean(product?.sample)
