import { memo, useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CrmSearchInputProps = {
  initialValue?: string;
  resetKey?: number;
  onSearch: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
};

export const CrmSearchInput = memo(function CrmSearchInput({
  initialValue = "",
  resetKey = 0,
  onSearch,
  inputRef,
  className,
}: CrmSearchInputProps) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    setDraft(initialValue);
  }, [resetKey, initialValue]);

  const submit = useCallback(() => {
    onSearch(draft.trim());
  }, [draft, onSearch]);

  const clear = useCallback(() => {
    setDraft("");
    onSearch("");
  }, [onSearch]);

  return (
    <div
      className={cn(
        "ml-auto flex min-w-[200px] max-w-[300px] flex-1 items-center gap-1",
        className,
      )}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--crm-ink-3)]"
          aria-hidden
        />
        <Input
          ref={inputRef as React.Ref<HTMLInputElement>}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Buscar... ( / )"
          aria-label="Buscar negociações"
          autoComplete="off"
          spellCheck={false}
          className="h-9 border-[var(--crm-border-2)] bg-card pl-9 pr-8 text-sm"
        />
        {draft ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface-2)] hover:text-[var(--crm-ink)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 border-[var(--crm-border-2)]"
        aria-label="Buscar"
        onClick={submit}
      >
        <Search className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
});
