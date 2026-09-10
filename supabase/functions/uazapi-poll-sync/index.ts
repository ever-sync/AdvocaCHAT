import { handleCors, jsonResponse } from "../_shared/http.ts";

Deno.serve((request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  return jsonResponse(
    {
      success: false,
      disabled: true,
      error:
        "uazapi-poll-sync foi desativado. O inbox recebe mensagens apenas por webhook em tempo real.",
    },
    410,
  );
});
