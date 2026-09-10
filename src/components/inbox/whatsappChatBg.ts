/** Gera o padrão de fundo do chat (SVG tile) com cor de fundo e do doodle. */
function buildChatBg(fill: string, stroke: string, strokeOpacity: number): string {
  return (
    "url('data:image/svg+xml;charset=utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
  <rect width="360" height="360" fill="${fill}"/>
  <g fill="none" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="1.2">
    <circle cx="40" cy="36" r="16"/><circle cx="200" cy="48" r="10"/><circle cx="312" cy="112" r="14"/>
    <circle cx="88" cy="156" r="18"/><circle cx="272" cy="208" r="12"/><circle cx="160" cy="296" r="20"/>
    <path d="M220 280l16-8 8 20"/><path d="M48 220c12-24 34-38 62-42"/><path d="M296 76l22 12-14 22"/>
    <ellipse cx="120" cy="72" rx="22" ry="12"/><ellipse cx="300" cy="292" rx="18" ry="10"/>
    <path d="M16 292l42-26 26 42"/><circle cx="180" cy="164" r="7"/><circle cx="328" cy="328" r="9"/>
    <circle cx="64" cy="332" r="11"/><path d="M140 132l44 8-28 38"/><circle cx="244" cy="344" r="6"/>
    <circle cx="12" cy="156" r="13"/><circle cx="332" cy="176" r="8"/><circle cx="152" cy="248" r="14"/>
    <circle cx="200" cy="336" r="10"/><circle cx="52" cy="96" r="9"/><circle cx="264" cy="148" r="11"/>
    <circle cx="88" cy="284" r="8"/><circle cx="228" cy="248" r="10"/><circle cx="308" cy="236" r="9"/>
    <circle cx="16" cy="248" r="10"/><circle cx="176" cy="104" r="8"/><circle cx="320" cy="52" r="12"/>
    <circle cx="140" cy="336" r="7"/><circle cx="52" cy="188" r="8"/><circle cx="264" cy="296" r="9"/>
    <circle cx="108" cy="332" r="7"/><circle cx="224" cy="164" r="8"/><circle cx="304" cy="336" r="8"/>
  </g>
</svg>`,
    ) +
    "')"
  );
}

/** Fundo do chat — tema claro (cinza-azulado + doodle navy). */
export const WHATSAPP_CHAT_BG = buildChatBg("#EEF2F5", "#003D5B", 0.05);

/** Fundo do chat — tema escuro (navy profundo + doodle ciano sutil). */
export const WHATSAPP_CHAT_BG_DARK = buildChatBg("#0A1016", "#5BBFD0", 0.06);
