// Transcrição de áudio (STT) via OpenAI. Usa OPENAI_API_KEY independentemente do
// provedor de LLM do tenant (transcrição é sempre OpenAI aqui).
// A mídia de entrada do WhatsApp é espelhada no Storage público (media_url), então
// dá pra baixar a URL direto e enviar os bytes — sem precisar descriptografar.

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
// whisper-1 tem disponibilidade ampla e bom suporte a PT-BR. gpt-4o-mini-transcribe
// é um upgrade (melhor/mais barato) se estiver disponível na sua conta.
const TRANSCRIBE_MODEL = "whisper-1";

function guessExtension(url: string): string {
  const match = url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i);
  return match ? match[1].toLowerCase() : "ogg"; // áudio de WhatsApp costuma ser ogg/opus
}

/** Baixa o áudio da URL pública e transcreve. Retorna o texto (pode lançar). */
export async function transcribeAudio(mediaUrl: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const audioRes = await fetch(mediaUrl);
  if (!audioRes.ok) throw new Error(`fetch audio ${audioRes.status}`);
  const blob = await audioRes.blob();

  const form = new FormData();
  form.append("file", blob, `audio.${guessExtension(mediaUrl)}`);
  form.append("model", TRANSCRIBE_MODEL);

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` }, // não setar content-type: FormData define o boundary
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI transcribe ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
