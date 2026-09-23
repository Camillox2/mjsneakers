import { useState } from "react";
import { DROPS, SIZES, brl, dropById, type Drop } from "@/lib/catalog";
import { useCart } from "@/lib/cart";

type Props = {
  selectedId: string;
  onSelect: (id: string) => void;
};

export function Shop({ selectedId, onSelect }: Props) {
  const [brand, setBrand] = useState("Todas");
  const [size, setSize] = useState<number | null>(40);
  const [needSize, setNeedSize] = useState(false);
  const { add } = useCart();
  const brands = ["Todas", ...DROPS.map((drop) => drop.brand)];
  const visible = DROPS.filter((drop) => brand === "Todas" || drop.brand === brand);
  const selected = dropById(selectedId);

  const reserve = (drop: Drop) => {
    if (!size) {
      setNeedSize(true);
      return;
    }
    setNeedSize(false);
    add(drop.id, size);
  };

  return (
    <section id="loja" className="scroll-mt-16 bg-bg text-fg">
      <div className="overflow-hidden border-y border-line pt-16 pb-3">
        <div className="ticker-track flex w-max gap-8">
          {[0, 1].map((copy) => (
            <p key={copy} className="font-display flex gap-8 text-sm tracking-[0.22em] uppercase">
              {DROPS.map((drop) => (
                <span key={`${copy}-${drop.id}`}>
                  {drop.brand} · {drop.name}
                </span>
              ))}
              <span>A loja abre aqui</span>
            </p>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-16 md:px-10 md:py-24">
        <img src="/brand/wordmark-tight.png" alt="Pizantt Drop" className="wordmark" />
        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="text-sm tracking-[0.22em] text-acid uppercase">A loja</p>
            <h2 className="font-display mt-2 text-4xl leading-none font-extrabold md:text-6xl">
              Três casas. Três exemplares.
            </h2>
            <p className="mt-4 text-muted">
              Pizantt, M&J e Cromo estão na vitrine como amostra de estúdio. Escolhe a marca, o par e o número.
              Quando o estoque real entrar, ele ocupa o lugar destes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {brands.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setBrand(name)}
                className={`press h-11 px-4 text-sm font-semibold ${
                  brand === name ? "bg-acid text-ink" : "bg-chip text-fg"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {visible.map((drop) => {
            const active = drop.id === selected.id;
            return (
              <button
                key={drop.id}
                type="button"
                onClick={() => onSelect(drop.id)}
                className={`press overflow-hidden bg-chip text-left ${active ? "ring-2 ring-acid" : ""}`}
              >
                <img src={drop.image} alt="" className="aspect-square w-full object-cover" />
                <span className="flex items-baseline justify-between gap-3 px-4 py-4">
                  <span>
                    <span className="block text-xs tracking-[0.18em] text-muted uppercase">{drop.brand}</span>
                    <span className="font-display mt-1 block text-2xl leading-none">{drop.name}</span>
                  </span>
                  <span className="tabular-nums text-sm">{brl(drop.price)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <article className="mt-6 grid items-stretch bg-chip md:grid-cols-2">
          <img src={selected.image} alt={`${selected.name} em detalhe`} className="h-full min-h-72 w-full object-cover" />
          <div className="flex flex-col p-6 md:p-10">
            <p className="text-xs tracking-[0.22em] text-acid uppercase">
              {selected.brand} · {selected.code}
            </p>
            <h3 className="font-display mt-2 text-4xl leading-none font-extrabold">{selected.name}</h3>
            <p className="mt-4 text-muted">{selected.note}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {selected.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-acid" />
                  {point}
                </li>
              ))}
            </ul>
            <p className="font-display mt-6 text-3xl tabular-nums">{brl(selected.price)}</p>
            <p className="mt-6 text-xs tracking-[0.18em] text-muted uppercase">Número BR</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SIZES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSize(value);
                    setNeedSize(false);
                  }}
                  className={`press h-11 w-11 text-sm font-semibold ${
                    size === value ? "bg-acid text-ink" : "bg-bg text-fg"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            {needSize && <p className="mt-3 text-sm text-acid">Escolhe um número pra reservar.</p>}
            <button
              type="button"
              className="press mt-6 h-12 bg-acid px-5 text-sm font-semibold text-ink"
              onClick={() => reserve(selected)}
            >
              Colocar na sacola
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
