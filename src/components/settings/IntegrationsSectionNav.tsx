import { Megaphone, MessageSquare, Network, Webhook, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntegrationsSettingsSection = "canais" | "whatsapp" | "automacao" | "ads" | "webhooks";

const SECTIONS: {
  id: IntegrationsSettingsSection;
  label: string;
  icon: typeof MessageSquare;
}[] = [
  { id: "canais", label: "Canais", icon: Network },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "automacao", label: "IA e automacao", icon: Zap },
  { id: "ads", label: "ADS", icon: Megaphone },
  { id: "webhooks", label: "Webhooks & API", icon: Webhook },
];

export function parseIntegrationsSectionParam(
  value: string | null,
): IntegrationsSettingsSection {
  if (
    value === "canais" ||
    value === "automacao" ||
    value === "whatsapp" ||
    value === "ads" ||
    value === "webhooks"
  ) {
    return value;
  }
  return "whatsapp";
}

type IntegrationsSectionNavProps = {
  value: IntegrationsSettingsSection;
  onChange: (section: IntegrationsSettingsSection) => void;
};

export function IntegrationsSectionNav({ value, onChange }: IntegrationsSectionNavProps) {
  return (
    <nav
      className="flex shrink-0 flex-row flex-wrap gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 lg:w-52 lg:flex-col lg:flex-nowrap"
      aria-label="Secoes de integracoes"
    >
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = value === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors lg:flex-none lg:w-full",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
