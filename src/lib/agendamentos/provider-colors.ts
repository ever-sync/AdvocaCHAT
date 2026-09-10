// Cor determinística por prestador (ou qualquer chave), para distinguir colunas/
// cards na grade. Hash simples → paleta fixa (estável entre renders/sessões).

type ColorSet = {
  /** Borda lateral do card. */
  border: string;
  /** Fundo suave do card. */
  bg: string;
  /** Texto/realce. */
  text: string;
  /** Cor sólida (cabeçalho/ponto). */
  dot: string;
};

const PALETTE: ColorSet[] = [
  { border: "#2563eb", bg: "rgba(37,99,235,0.10)", text: "#1d4ed8", dot: "#2563eb" },
  { border: "#059669", bg: "rgba(5,150,105,0.10)", text: "#047857", dot: "#059669" },
  { border: "#d97706", bg: "rgba(217,119,6,0.12)", text: "#b45309", dot: "#d97706" },
  { border: "#7c3aed", bg: "rgba(124,58,237,0.10)", text: "#6d28d9", dot: "#7c3aed" },
  { border: "#db2777", bg: "rgba(219,39,119,0.10)", text: "#be185d", dot: "#db2777" },
  { border: "#0891b2", bg: "rgba(8,145,178,0.10)", text: "#0e7490", dot: "#0891b2" },
  { border: "#ca8a04", bg: "rgba(202,138,4,0.12)", text: "#a16207", dot: "#ca8a04" },
  { border: "#dc2626", bg: "rgba(220,38,38,0.10)", text: "#b91c1c", dot: "#dc2626" },
];

function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h << 5) - h + key.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function providerColor(key: string): ColorSet {
  return PALETTE[hash(key) % PALETTE.length];
}
