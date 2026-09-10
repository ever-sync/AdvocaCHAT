import { AlignLeft, Calendar, CheckSquare, List, Plus, Type, User, Heading1, ImagePlus } from "lucide-react";
import { useCustomerCustomFields } from "@/lib/api/customer-custom-fields";
import {
  buildCustomContactField,
  buildDefaultContactField,
  DEFAULT_CONTACT_FIELDS,
  type FormField,
  type FormFieldType,
} from "@/lib/marketing/form-types";

interface ContactFieldPaletteProps {
  existingFields: FormField[];
  onAddField: (field: FormField) => void;
  onAddExtra: (type: FormFieldType) => void;
}

const EXTRA_TYPES: { type: FormFieldType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "text", label: "Texto", icon: Type },
  { type: "textarea", label: "Texto longo", icon: AlignLeft },
  { type: "select", label: "Lista", icon: List },
  { type: "checkbox", label: "Caixas", icon: CheckSquare },
  { type: "date", label: "Data", icon: Calendar },
];

const VISUAL_TYPES: { type: FormFieldType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "title", label: "Título", icon: Heading1 },
  { type: "description", label: "Descrição", icon: AlignLeft },
  { type: "image", label: "Imagem", icon: ImagePlus },
];

function PaletteButton({
  label,
  disabled,
  onClick,
  icon: Icon,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-all hover:bg-background hover:text-foreground hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
    >
      {Icon ? <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-foreground" /> : <Plus className="h-4 w-4 flex-shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ContactFieldPalette({ existingFields, onAddField, onAddExtra }: ContactFieldPaletteProps) {
  const { data: customFields = [] } = useCustomerCustomFields();

  const usedDefault = new Set(
    existingFields.filter((f) => f.mapping?.kind === "default").map((f) => (f.mapping as { key: string }).key),
  );
  const usedCustom = new Set(
    existingFields.filter((f) => f.mapping?.kind === "custom").map((f) => (f.mapping as { fieldId: string }).fieldId),
  );

  return (
    <div className="w-56 flex-shrink-0 overflow-y-auto bg-muted/40 p-3">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Campos do contato
      </p>
      <div className="space-y-0.5">
        {DEFAULT_CONTACT_FIELDS.map((d) => (
          <PaletteButton
            key={d.key}
            label={d.label}
            icon={User}
            disabled={usedDefault.has(d.key)}
            onClick={() => onAddField(buildDefaultContactField(d.key))}
          />
        ))}
        {customFields.map((f) => (
          <PaletteButton
            key={f.id}
            label={f.nome}
            disabled={usedCustom.has(f.id)}
            onClick={() => onAddField(buildCustomContactField({ id: f.id, nome: f.nome, kind: f.kind, options: f.options }))}
          />
        ))}
      </div>

      <p className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Outras informações
      </p>
      <div className="space-y-0.5">
        {EXTRA_TYPES.map(({ type, label, icon }) => (
          <PaletteButton key={type} label={label} icon={icon} onClick={() => onAddExtra(type)} />
        ))}
      </div>

      <p className="mt-4 px-1 text-[10px] leading-relaxed text-muted-foreground">
        Campos do contato salvam no cadastro. "Outras informações" vão para a negociação.
      </p>

      <p className="mb-2 mt-6 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Elementos Visuais
      </p>
      <div className="space-y-0.5 pb-4">
        {VISUAL_TYPES.map(({ type, label, icon }) => (
          <PaletteButton key={type} label={label} icon={icon} onClick={() => onAddExtra(type)} />
        ))}
      </div>
    </div>
  );
}
