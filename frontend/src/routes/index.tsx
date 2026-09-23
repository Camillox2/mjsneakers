import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CartProvider } from "@/lib/cart";
import { SiteHeader } from "@/components/site-header";
import { Reel } from "@/components/reel";
import { Shop } from "@/components/shop";
import { CartDrawer } from "@/components/cart-drawer";
import { DROPS } from "@/lib/catalog";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <CartProvider>
      <Store />
    </CartProvider>
  );
}

function Store() {
  const [selectedId, setSelectedId] = useState(DROPS[0].id);

  const reserve = (id: string) => {
    setSelectedId(id);
    document.getElementById("loja")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main id="topo">
      <SiteHeader />
      <Reel onReserve={reserve} />
      <Shop selectedId={selectedId} onSelect={setSelectedId} />
      <footer className="border-t border-line px-5 py-8 text-sm text-muted md:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p>M&J Sneakers · Pizantt Drop</p>
          <p>Exemplares de estúdio. O catálogo real entra depois.</p>
        </div>
      </footer>
      <CartDrawer />
    </main>
  );
}
