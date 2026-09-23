import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { DROPS } from "@/lib/catalog";
import { useCart } from "@/lib/cart";

export function SiteHeader() {
  const { count, setOpen } = useCart();
  const [tone, setTone] = useState<"light" | "dark">("light");

  useEffect(() => {
    const shop = document.getElementById("loja");
    const read = () => {
      if (!shop) return;
      const shopTop = shop.getBoundingClientRect().top;
      if (shopTop < 80) {
        setTone("light");
        return;
      }
      const progress = Number(getComputedStyle(document.documentElement).getPropertyValue("--p")) || 0;
      const index = Math.min(DROPS.length - 1, Math.floor(progress * DROPS.length));
      setTone(DROPS[index]?.tone ?? "light");
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  return (
    <header
      data-tone={tone}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 px-3 py-3 md:px-8"
    >
      <a href="#topo" className="pointer-events-auto flex min-w-0 items-baseline gap-2">
        <span className="font-display text-sm tracking-[0.14em] min-[380px]:text-base min-[380px]:tracking-[0.18em] sm:text-lg sm:tracking-[0.22em]">M&J</span>
        <span className="hidden text-[11px] tracking-[0.2em] uppercase opacity-70 min-[380px]:inline">Sneakers</span>
      </a>
      <nav className="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <a href="#loja" className="press inline-flex h-11 items-center px-2 text-sm font-semibold sm:px-3">
          Loja
        </a>
        <button
          type="button"
          className="press inline-flex h-10 items-center gap-1.5 bg-acid px-2 text-sm font-semibold text-ink sm:h-11 sm:gap-2 sm:px-3"
          onClick={() => setOpen(true)}
        >
          <ShoppingBag size={18} />
          <span className="hidden sm:inline">Sacola</span>
          <span className="tabular-nums">{count}</span>
        </button>
      </nav>
    </header>
  );
}
