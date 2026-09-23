import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dropById } from "@/lib/catalog";

export type Line = { id: string; size: number; qty: number };

type CartValue = {
  lines: Line[];
  open: boolean;
  setOpen: (open: boolean) => void;
  count: number;
  total: number;
  add: (id: string, size: number) => void;
  remove: (id: string, size: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartValue | null>(null);
const KEY = "mj-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Line[];
        if (Array.isArray(parsed)) setLines(parsed.filter((line) => line && line.qty > 0));
      }
    } catch {
      /* ignore broken storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const value = useMemo<CartValue>(() => {
    const count = lines.reduce((sum, line) => sum + line.qty, 0);
    const total = lines.reduce((sum, line) => sum + dropById(line.id).price * line.qty, 0);
    return {
      lines,
      open,
      setOpen,
      count,
      total,
      add: (id, size) => {
        setLines((current) => {
          const hit = current.find((line) => line.id === id && line.size === size);
          if (hit) {
            return current.map((line) =>
              line === hit ? { ...line, qty: Math.min(4, line.qty + 1) } : line,
            );
          }
          return [...current, { id, size, qty: 1 }];
        });
        setOpen(true);
      },
      remove: (id, size) => {
        setLines((current) => current.filter((line) => !(line.id === id && line.size === size)));
      },
      clear: () => setLines([]),
    };
  }, [lines, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart fora do provider");
  return value;
}
