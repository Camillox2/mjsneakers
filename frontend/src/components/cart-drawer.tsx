import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { brl, dropById } from "@/lib/catalog";
import { useCart } from "@/lib/cart";

export function CartDrawer() {
  const { lines, open, setOpen, total, remove, clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || phone.trim().length < 8 || !city.trim()) {
      setError("Nome, WhatsApp e cidade pra fechar a reserva.");
      return;
    }
    if (lines.length === 0) return;
    const next = `MJ-${Math.floor(1000 + Math.random() * 9000)}`;
    const order = {
      code: next,
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      lines,
      total,
      at: new Date().toISOString(),
    };
    const previous = JSON.parse(localStorage.getItem("mj-orders") || "[]") as unknown[];
    localStorage.setItem("mj-orders", JSON.stringify([order, ...previous].slice(0, 12)));
    clear();
    setCode(next);
    setError("");
  };

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        aria-label="Fechar sacola"
        className={`absolute inset-0 bg-bg/70 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Sacola"
        className={`absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-fg text-ink transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-2xl">Sacola</h2>
          <button type="button" className="press grid h-11 w-11 place-items-center" onClick={() => setOpen(false)}>
            <X />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {code && (
            <div className="mb-5 bg-ink px-4 py-4 text-fg">
              <p className="text-xs tracking-[0.18em] text-acid uppercase">Reserva feita</p>
              <p className="font-display mt-1 text-3xl">{code}</p>
              <p className="mt-2 text-sm text-fg/80">
                Guarda esse código. A M&J confirma o par e o frete no WhatsApp quando o estoque real entrar.
              </p>
            </div>
          )}

          {lines.length === 0 && !code && (
            <p className="text-ink/70">A sacola está vazia. Escolhe um exemplar lá embaixo.</p>
          )}

          <ul className="space-y-4">
            {lines.map((line) => {
              const drop = dropById(line.id);
              return (
                <li key={`${line.id}-${line.size}`} className="grid grid-cols-[5rem_1fr] gap-3">
                  <img src={drop.image} alt="" className="h-20 w-20 object-cover" />
                  <div>
                    <p className="text-xs tracking-[0.16em] uppercase">{drop.brand}</p>
                    <p className="font-display text-xl leading-none">{drop.name}</p>
                    <p className="mt-1 text-sm tabular-nums">
                      {line.size} · {brl(drop.price)} · qtd {line.qty}
                    </p>
                    <button
                      type="button"
                      className="press mt-2 text-sm underline"
                      onClick={() => remove(line.id, line.size)}
                    >
                      Tirar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {lines.length > 0 && (
            <form className="mt-8 space-y-3" onSubmit={submit}>
              <p className="font-display text-3xl tabular-nums">{brl(total)}</p>
              <label className="block text-sm">
                Nome
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 h-12 w-full border border-ink/20 bg-transparent px-3"
                  autoComplete="name"
                />
              </label>
              <label className="block text-sm">
                WhatsApp
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-1 h-12 w-full border border-ink/20 bg-transparent px-3"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
              <label className="block text-sm">
                Cidade
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="mt-1 h-12 w-full border border-ink/20 bg-transparent px-3"
                  autoComplete="address-level2"
                />
              </label>
              {error && <p className="text-sm">{error}</p>}
              <button type="submit" className="press h-12 w-full bg-ink text-sm font-semibold text-acid">
                Fechar reserva
              </button>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
