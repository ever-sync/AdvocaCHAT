import { FormWidget } from "@/widget/FormWidget";

/**
 * Rota pública `/embed` — renderiza o formulário público dentro do SPA.
 * Garante o funcionamento do embed em hosts que fazem fallback de SPA
 * (quando o build estático `dist/embed/` não é servido como arquivo).
 * O formId vem da query string (?formId=...), lido pelo FormWidget.
 */
export default function EmbedForm() {
  return <FormWidget />;
}
