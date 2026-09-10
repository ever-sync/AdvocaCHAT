import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isInlineMediaUrlAllowed } from "@/lib/restricted-media-hosts";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getConversationTone(name: string) {
  const tones = [
    "from-[var(--inbox-orange-tint)] to-[var(--inbox-orange-border)] text-[var(--inbox-orange)]",
    "from-[var(--inbox-green-tint)] to-[var(--inbox-green-bright)] text-[var(--inbox-green)]",
    "from-[var(--inbox-green-tint)] to-[var(--inbox-green-soft)] text-[var(--inbox-green)]",
    "from-[var(--inbox-blue-tint)] to-[var(--inbox-blue-tint)] text-[var(--crm-brand)]",
  ];
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index)) % tones.length;
  }

  return tones[hash];
}

export function ConversationAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md";
}) {
  const safeAvatarUrl = avatarUrl && isInlineMediaUrlAllowed(avatarUrl) ? avatarUrl : null;

  return (
    <Avatar
      className={cn(
        "border border-card/90 shadow-[0_10px_24px_rgba(37,63,51,0.10)]",
        size === "xs" ? "h-9 w-9" : size === "sm" ? "h-11 w-11" : "h-12 w-12",
      )}
    >
      {safeAvatarUrl ? <AvatarImage src={safeAvatarUrl} alt={name} /> : null}
      <AvatarFallback
        className={cn(
          `bg-gradient-to-br ${getConversationTone(name)} font-semibold`,
          size === "xs" ? "text-[10px]" : size === "sm" ? "text-xs" : "text-sm",
        )}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
