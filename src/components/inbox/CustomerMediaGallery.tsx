import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, ImageIcon, Music, Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveInboxAttachmentPresentation,
  type InboxAttachmentPresentation,
} from "@/lib/inboxMessageMedia";
import type { WhatsappMessage } from "@/types/domain";

type ResolvedMedia = {
  message: WhatsappMessage;
  presentation: InboxAttachmentPresentation;
};

function getTimestamp(m: WhatsappMessage): number {
  const raw = m.createdAt ?? m.sentAt ?? m.receivedAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function formatItemDate(m: WhatsappMessage): string {
  const ts = getTimestamp(m);
  if (!ts) return "";
  return format(new Date(ts), "dd MMM · HH:mm", { locale: ptBR });
}

/**
 * Galeria de mídias trocadas no chat. Reusa `resolveInboxAttachmentPresentation`
 * (mesmo helper que o MessageBubble) — separa imagens/vídeos em grid 3-col,
 * áudios em lista vertical com `<audio controls>` compacto, documentos em
 * cards clicáveis. Sempre ordena do mais recente para o mais antigo.
 */
export function CustomerMediaGallery({
  messages,
}: {
  messages: WhatsappMessage[];
}) {
  const { images, videos, audios, documents } = useMemo(() => {
    const groups = {
      images: [] as ResolvedMedia[],
      videos: [] as ResolvedMedia[],
      audios: [] as ResolvedMedia[],
      documents: [] as ResolvedMedia[],
    };
    for (const message of messages) {
      const presentation = resolveInboxAttachmentPresentation(message);
      if (!presentation) continue;
      const item = { message, presentation };
      if (presentation.kind === "image") groups.images.push(item);
      else if (presentation.kind === "video") groups.videos.push(item);
      else if (presentation.kind === "audio") groups.audios.push(item);
      else groups.documents.push(item);
    }
    const byTimeDesc = (a: ResolvedMedia, b: ResolvedMedia) =>
      getTimestamp(b.message) - getTimestamp(a.message);
    groups.images.sort(byTimeDesc);
    groups.videos.sort(byTimeDesc);
    groups.audios.sort(byTimeDesc);
    groups.documents.sort(byTimeDesc);
    return groups;
  }, [messages]);

  const total = images.length + videos.length + audios.length + documents.length;

  if (total === 0) {
    return (
      <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-6 text-center shadow-sm">
        <ImageIcon className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">Nenhuma mídia ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Imagens, áudios e arquivos compartilhados nesta conversa vão aparecer aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {images.length > 0 ? (
        <GallerySection title="Imagens" count={images.length} icon={<ImageIcon className="h-3.5 w-3.5" />}>
          <ThumbnailGrid items={images} />
        </GallerySection>
      ) : null}

      {videos.length > 0 ? (
        <GallerySection title="Vídeos" count={videos.length} icon={<VideoIcon className="h-3.5 w-3.5" />}>
          <ThumbnailGrid items={videos} />
        </GallerySection>
      ) : null}

      {audios.length > 0 ? (
        <GallerySection title="Áudios" count={audios.length} icon={<Music className="h-3.5 w-3.5" />}>
          <ul className="space-y-2">
            {audios.map((item) => (
              <li
                key={item.message.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--inbox-border)] bg-card px-3 py-2"
              >
                <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <audio controls preload="metadata" src={item.presentation.url} className="h-9 w-full" />
                  <p className="mt-1 text-[11px] text-muted-foreground">{formatItemDate(item.message)}</p>
                </div>
              </li>
            ))}
          </ul>
        </GallerySection>
      ) : null}

      {documents.length > 0 ? (
        <GallerySection title="Documentos" count={documents.length} icon={<FileText className="h-3.5 w-3.5" />}>
          <ul className="space-y-2">
            {documents.map((item) => (
              <li key={item.message.id}>
                <a
                  href={item.presentation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-xl border border-[var(--inbox-border)] bg-card px-3 py-2.5",
                    "text-sm font-medium text-foreground transition-colors hover:bg-wchat-50",
                  )}
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {item.presentation.kind === "document" ? item.presentation.label : "Documento"}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatItemDate(item.message)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </GallerySection>
      ) : null}
    </div>
  );
}

function GallerySection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-2 flex items-center gap-1.5">
        <span className="text-muted-foreground" aria-hidden>
          {icon}
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">· {count}</span>
      </header>
      {children}
    </section>
  );
}

function ThumbnailGrid({ items }: { items: ResolvedMedia[] }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {items.map((item) => (
        <li key={item.message.id}>
          <a
            href={item.presentation.url}
            target="_blank"
            rel="noopener noreferrer"
            title={formatItemDate(item.message)}
            className="group block aspect-square overflow-hidden rounded-lg border border-[var(--inbox-border)] bg-wchat-50"
          >
            {item.presentation.kind === "image" ? (
              <img
                src={item.presentation.url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center bg-black/5">
                <video
                  src={item.presentation.url}
                  preload="metadata"
                  muted
                  className="h-full w-full object-cover"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                  <VideoIcon className="h-6 w-6 text-white" aria-hidden />
                </span>
              </div>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
