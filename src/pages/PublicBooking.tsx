import { useParams } from "react-router-dom";
import { BookingWidget } from "@/widget/BookingWidget";

/** Rota pública `/agendar/:slug` — página de auto-agendamento (sem login). */
export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white text-sm text-slate-500">
        Link de agendamento inválido.
      </div>
    );
  }
  return <BookingWidget slug={slug} />;
}
