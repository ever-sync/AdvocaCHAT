import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { uploadWhatsappMediaFile } from "@/lib/api/whatsapp-media";
import {
  parseCustomFieldOptions,
  parseGalleryValue,
  serializeGalleryValue,
  type CustomFieldKind,
} from "@/lib/custom-field-kinds";
import {
  applyCustomFieldInputMask,
  customFieldKindHasInputMask,
  getCustomFieldInputMaxLength,
} from "@/lib/custom-field-masks";

export type CustomFieldDefinitionLike = {
  id: string;
  nome: string;
  kind: CustomFieldKind;
  options?: string[];
};

type CustomerCustomFieldInputProps = {
  field: CustomFieldDefinitionLike;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  labelClassName?: string;
  inputClassName?: string;
  disabled?: boolean;
};

function boolFromValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "sim" || v === "yes";
}

function FieldShell({
  label,
  labelClassName,
  htmlFor,
  children,
}: {
  label: string;
  labelClassName?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className={labelClassName}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function BoolRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

function getNativeInputProps(kind: CustomFieldKind): {
  type: string;
  inputMode?: "numeric" | "decimal" | "email" | "tel" | "url";
  placeholder?: string;
} {
  if (customFieldKindHasInputMask(kind)) {
    return {
      type: "text",
      inputMode: kind === "inteiro" || kind === "moeda" || kind === "porcentagem" || kind === "numero" ? "decimal" : "numeric",
      placeholder: getMaskedPlaceholder(kind),
    };
  }

  switch (kind) {
    case "email":
      return { type: "email", inputMode: "email", placeholder: "email@exemplo.com" };
    case "url":
      return { type: "url", inputMode: "url", placeholder: "https://…" };
    case "data":
      return { type: "date" };
    case "hora":
      return { type: "time" };
    case "data_hora":
      return { type: "datetime-local" };
    default:
      return { type: "text" };
  }
}

function getMaskedPlaceholder(kind: CustomFieldKind): string | undefined {
  switch (kind) {
    case "cpf":
      return "000.000.000-00";
    case "cnpj":
      return "00.000.000/0000-00";
    case "cep":
      return "00000-000";
    case "telefone":
      return "(11) 99999-9999";
    case "moeda":
      return "R$ 0,00";
    case "porcentagem":
      return "0%";
    case "numero":
      return "0,00";
    default:
      return undefined;
  }
}

function handleMaskedChange(kind: CustomFieldKind, raw: string, onChange: (value: string) => void) {
  onChange(applyCustomFieldInputMask(kind, raw));
}

function GalleryField({
  label,
  labelClassName,
  value,
  onChange,
  disabled,
}: {
  label: string;
  labelClassName?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const urls = parseGalleryValue(value);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        try {
          added.push(await uploadWhatsappMediaFile(file));
        } catch (err) {
          toast({
            title: "Falha ao enviar imagem",
            description: err instanceof Error ? err.message : file.name,
            variant: "destructive",
          });
        }
      }
      if (added.length) onChange(serializeGalleryValue([...urls, ...added]));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => {
    onChange(serializeGalleryValue(urls.filter((_, i) => i !== idx)));
  };

  return (
    <div className="space-y-2">
      <Label className={labelClassName}>{label}</Label>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {urls.map((url, idx) => (
          <div key={`${url}-${idx}`} className="group relative aspect-square overflow-hidden rounded-md border border-border">
            <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
              <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </a>
            {!disabled ? (
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remover imagem"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
        {!disabled ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            aria-label="Adicionar imagens"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </button>
        ) : null}
      </div>
      {urls.length === 0 && disabled ? (
        <p className="text-xs text-muted-foreground">Sem imagens.</p>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

export function CustomerCustomFieldInput({
  field,
  value,
  onChange,
  id,
  labelClassName,
  inputClassName = "rounded-[10px]",
  disabled = false,
}: CustomerCustomFieldInputProps) {
  const inputId = id ?? `customer-custom-${field.id}`;
  const { kind } = field;
  const options = parseCustomFieldOptions(field.options ?? []);
  const isMasked = customFieldKindHasInputMask(kind);
  const maxLength = getCustomFieldInputMaxLength(kind);

  if (kind === "galeria") {
    return (
      <GalleryField
        label={field.nome}
        labelClassName={labelClassName}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (kind === "booleano") {
    return (
      <FieldShell label={field.nome} labelClassName={labelClassName} htmlFor={inputId}>
        <BoolRow>
          <Switch
            id={inputId}
            checked={boolFromValue(value)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked ? "1" : "0")}
          />
          <span className="text-sm text-muted-foreground">{boolFromValue(value) ? "Sim" : "Não"}</span>
        </BoolRow>
      </FieldShell>
    );
  }

  if (kind === "lista" && options.length > 0) {
    return (
      <FieldShell label={field.nome} labelClassName={labelClassName} htmlFor={inputId}>
        <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={inputId} className={inputClassName}>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }

  if (kind === "texto_longo") {
    return (
      <FieldShell label={field.nome} labelClassName={labelClassName} htmlFor={inputId}>
        <Textarea
          id={inputId}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          rows={3}
        />
      </FieldShell>
    );
  }

  if (kind === "cor") {
    return (
      <FieldShell label={field.nome} labelClassName={labelClassName} htmlFor={inputId}>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            type="color"
            value={value || "#6366f1"}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-[10px] p-1"
          />
          <Input
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#6366f1"
            className={`${inputClassName} flex-1`}
          />
        </div>
      </FieldShell>
    );
  }

  const inputProps = getNativeInputProps(kind);

  return (
    <FieldShell label={field.nome} labelClassName={labelClassName} htmlFor={inputId}>
      <Input
        id={inputId}
        type={inputProps.type}
        inputMode={inputProps.inputMode}
        placeholder={inputProps.placeholder}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          isMasked
            ? handleMaskedChange(kind, e.target.value, onChange)
            : onChange(e.target.value)
        }
        className={inputClassName}
      />
    </FieldShell>
  );
}
