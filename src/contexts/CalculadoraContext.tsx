import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CalculadoraPopup } from "@/components/calculadora/CalculadoraPopup";

type CalculadoraContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openCalculadora: () => void;
};

const CalculadoraContext = createContext<CalculadoraContextValue | null>(null);

export function CalculadoraProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openCalculadora = useCallback(() => setOpen(true), []);

  const value = useMemo(
    () => ({ open, setOpen, openCalculadora }),
    [open, openCalculadora],
  );

  return (
    <CalculadoraContext.Provider value={value}>
      {children}
      <CalculadoraPopup open={open} onOpenChange={setOpen} />
    </CalculadoraContext.Provider>
  );
}

export function useCalculadora() {
  const ctx = useContext(CalculadoraContext);
  if (!ctx) {
    throw new Error("useCalculadora must be used within CalculadoraProvider");
  }
  return ctx;
}
