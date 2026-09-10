// Tipos de e-mail (templates por bloco). Espelha o render Deno em _shared/email.ts.

export type EmailBlockType = "header" | "text" | "image" | "button" | "divider" | "footer";

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  content?: string;
  logoUrl?: string;
  backgroundColor?: string;
  src?: string;
  alt?: string;
  label?: string;
  url?: string;
  color?: string;
  unsubscribeUrl?: string;
  dividerColor?: string;
  dividerThickness?: number;
  dividerMargin?: number;
}

export interface MarketingEmailTemplate {
  id: string;
  tenantId: string;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export const EMAIL_BLOCK_LABELS: Record<EmailBlockType, string> = {
  header: "Cabeçalho",
  text: "Texto",
  image: "Imagem",
  button: "Botão",
  divider: "Divisória",
  footer: "Rodapé",
};

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function createDefaultEmailBlock(type: EmailBlockType): EmailBlock {
  const id = `block_${shortId()}`;
  switch (type) {
    case "header":
      return { id, type, backgroundColor: "#111827", logoUrl: "" };
    case "text":
      return { id, type, content: "Olá {{name}}, recebemos seu contato!" };
    case "button":
      return { id, type, label: "Acessar", url: "https://", color: "#4f46e5" };
    case "image":
      return { id, type, src: "", alt: "" };
    case "divider":
      return { id, type, dividerColor: "#e5e7eb", dividerThickness: 1, dividerMargin: 8 };
    case "footer":
      return { id, type, content: "Você recebeu este e-mail porque preencheu nosso formulário." };
    default:
      return { id, type: "text", content: "" };
  }
}

export const DEFAULT_EMAIL_BLOCKS: EmailBlock[] = [
  createDefaultEmailBlock("text"),
];
