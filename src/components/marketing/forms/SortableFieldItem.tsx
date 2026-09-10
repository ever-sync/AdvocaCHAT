import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Copy, GripVertical, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FIELD_TYPE_LABELS, type FormField } from "@/lib/marketing/form-types";

interface SortableFieldItemProps {
  field: FormField;
  isSelected: boolean;
  errorCount?: number;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function SortableFieldItem({
  field,
  isSelected,
  errorCount = 0,
  onSelect,
  onDuplicate,
  onRemove,
}: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "flex select-none items-center gap-2.5 rounded-lg border bg-card p-3 transition-all cursor-pointer",
        isSelected
          ? "border-primary ring-1 ring-primary shadow-sm"
          : "border-border hover:border-muted-foreground/40 hover:shadow-sm",
        isDragging && "scale-[1.02] opacity-40 shadow-xl",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{field.label || "Sem rótulo"}</span>
          {field.required && <span className="text-xs leading-none text-red-500">*</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px] font-normal">
            {FIELD_TYPE_LABELS[field.type] ?? field.type}
          </Badge>
          <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
            {field.layoutWidth ?? 100}%
          </Badge>
          {field.lineBreakBefore ? (
            <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px] font-normal">
              nova linha
            </Badge>
          ) : null}
          {field.conditionalLogic ? (
            <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] font-normal text-primary">
              condicional
            </Badge>
          ) : null}
          <span className="truncate font-mono text-[11px] text-muted-foreground">{field.name}</span>
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
              <AlertCircle className="h-3 w-3" />
              {errorCount} erro{errorCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
        className="flex-shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-blue-50 hover:text-blue-600"
        title="Duplicar campo"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex-shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-red-50 hover:text-red-500"
        title="Remover campo"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
