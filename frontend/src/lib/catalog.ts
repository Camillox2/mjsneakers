export type Drop = {
  id: string;
  brand: string;
  name: string;
  code: string;
  price: number;
  image: string;
  tone: "light" | "dark";
  sole: string;
  lace: string;
  line: string;
  note: string;
  points: string[];
};

export const DROPS: Drop[] = [
  {
    id: "violeta",
    brand: "Pizantt",
    name: "Violeta 04",
    code: "PZ-04",
    price: 489,
    image: "/drops/violeta.jpg",
    tone: "light",
    sole: "42 mm",
    lace: "Corda",
    line: "Dois lilases. Sola alta. Bico redondo.",
    note: "O par que abre a vitrine. Recorte diagonal no cabedal, entressola clara e cadarço de corda.",
    points: ["Cabedal liso em dois tons", "Entressola alta esculpida", "Biqueira arredondada"],
  },
  {
    id: "cobalto",
    brand: "M&J",
    name: "Cobalto 11",
    code: "MJ-11",
    price: 519,
    image: "/drops/cobalto.jpg",
    tone: "dark",
    sole: "36 mm",
    lace: "Marinho",
    line: "Azul de quadra com recorte gelo.",
    note: "A casa M&J em azul elétrico. A faixa clara corta o cabedal e a sola aparece inteira de lado.",
    points: ["Recorte gelo costurado", "Parede de sola alta", "Perfil de quadra"],
  },
  {
    id: "noite",
    brand: "Cromo",
    name: "Noite",
    code: "CR-01",
    price: 549,
    image: "/drops/noite.jpg",
    tone: "dark",
    sole: "28 mm",
    lace: "Fosco",
    line: "Preto quieto, calcanhar de metal.",
    note: "O exemplar de galeria. Cabedal sem brilho, calcanhar cromado e sola branca baixa.",
    points: ["Calcanhar metálico", "Sola branca de galeria", "Linha baixa"],
  },
];

export const SIZES = [34, 35, 36, 37, 38, 39, 40, 41, 42, 43] as const;

export const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);

export function dropById(id: string) {
  return DROPS.find((drop) => drop.id === id) ?? DROPS[0];
}
