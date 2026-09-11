import { useLayoutEffect } from "react";

/** Existing saved files are unaffected; these old public signing links are retired. */
export function LegacyPublicDocumentRetired() {
  useLayoutEffect(() => {
    // Remove old PII/token query parameters from this history entry before any
    // interaction. This component neither loads client data nor submits documents.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    document.title = "Link descontinuado | CaleoCRM";
  }, []);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <section className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 text-card-foreground">
        <h1 className="text-xl font-semibold">Este link antigo foi descontinuado</h1>
        <p>Solicite um novo link seguro ao escritório responsável pelo seu caso.</p>
        <p className="text-sm text-muted-foreground">Os documentos já enviados continuam com o escritório.</p>
      </section>
    </main>
  );
}
