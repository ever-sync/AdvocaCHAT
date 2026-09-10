import { useState } from "react";
import { Gift, GripVertical, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isExecutableMarketingFlowAction } from "@/lib/marketing/flow-types";
import {
  ACTION_CATEGORIES,
  ACTION_ICONS,
  DRAG_MIME,
  type ActionCategory,
  type ActionDefinition,
  type DragPayload,
  type ItemBadge,
} from "./flow-actions";

function ItemBadgeRender({ badge }: { badge: ItemBadge }) {
  if (badge.kind === "novo") {
    return (
      <span className="inline-flex items-center rounded-md bg-cyan-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground">
        Novo
      </span>
    );
  }
  if (badge.kind === "creditos") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white">
        <Gift className="h-3.5 w-3.5" aria-hidden />
        {badge.label}
      </span>
    );
  }
  if (badge.kind === "conheca") {
    return (
      <span className="inline-flex items-center rounded-md border border-violet-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-600">
        Conheça
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
      Plano Advanced
    </span>
  );
}

function ActionItemRow({ item }: { item: ActionDefinition }) {
  const Icon = ACTION_ICONS[item.iconKey];
  const executable = isExecutableMarketingFlowAction(item.id);

  // Ações sem executor no worker não podem ir para um fluxo publicado — mostra
  // como "Em breve" e bloqueia o arraste (evita a armadilha de montar e não rodar).
  if (!executable) {
    return (
      <div
        aria-disabled
        title="Em breve — esta ação ainda não executa em fluxos publicados"
        className="flex cursor-not-allowed items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5 opacity-60"
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
            item.iconClass,
          )}
        >
          {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
        </span>
        <span className="flex-1 truncate text-base font-medium text-muted-foreground">
          {item.label}
        </span>
        <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Em breve
        </span>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={(event) => {
        const payload: DragPayload = {
          actionId: item.id,
          label: item.label,
          iconKey: item.iconKey,
          iconClass: item.iconClass,
          defaultSubtitle: item.defaultSubtitle,
        };
        const data = JSON.stringify(payload);
        event.dataTransfer.setData(DRAG_MIME, data);
        event.dataTransfer.setData("text/plain", data);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className="flex cursor-grab items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary hover:bg-primary/5 active:cursor-grabbing"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
          item.iconClass,
        )}
      >
        {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      </span>
      <span className="flex-1 truncate text-base font-medium text-foreground">
        {item.label}
      </span>
      {item.badge ? <ItemBadgeRender badge={item.badge} /> : null}
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
    </div>
  );
}

function CategoryRow({
  category,
  open,
  onToggle,
}: {
  category: ActionCategory;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between py-4 text-left text-sm font-bold uppercase tracking-wide transition-colors",
          open ? "text-primary" : "text-foreground hover:text-primary",
        )}
      >
        <span>{category.label}</span>
        <svg
          className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 pb-4">
          {category.items.map((item) => (
            <ActionItemRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MarketingFlowActionsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [openCategory, setOpenCategory] = useState<string | null>("comunicacao");

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="w-full max-w-md gap-0 p-0 sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-6 py-5">
          <SheetTitle className="text-xl font-semibold">Ações</SheetTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <SheetDescription className="mb-2 text-base text-foreground">
            Arraste a ação que deseja utilizar para o fluxo
          </SheetDescription>

          <div className="mt-4 flex flex-col">
            {ACTION_CATEGORIES.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                open={openCategory === category.id}
                onToggle={() =>
                  setOpenCategory((prev) => (prev === category.id ? null : category.id))
                }
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
