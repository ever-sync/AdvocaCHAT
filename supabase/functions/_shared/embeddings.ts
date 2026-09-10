// Embeddings via Voyage AI (parceiro recomendado pela Anthropic).
// voyage-3.5 → 1024 dims (bate com vector(1024) em ai_knowledge_chunks).
// input_type: 'document' na ingestão, 'query' na busca (melhora a relevância).

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const MODEL = "voyage-3.5";
const RERANK_MODEL = "rerank-2-lite";
export const EMBEDDING_DIMENSIONS = 1024;
const BATCH_SIZE = 96;

type VoyageResponse = {
  data: Array<{ embedding: number[]; index: number }>;
};

async function callVoyage(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY not configured");
  }

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as VoyageResponse;
  // A API pode retornar fora de ordem; reordena por index.
  return data.data.slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embedding de uma consulta (busca). */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await callVoyage([text], "query");
  return embedding;
}

/** Embeddings de documentos (ingestão), em lotes. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await callVoyage(texts.slice(i, i + BATCH_SIZE), "document")));
  }
  return out;
}

export type RerankResult = { index: number; relevanceScore: number };

type VoyageRerankResponse = {
  data: Array<{ index: number; relevance_score: number }>;
};

/**
 * Rerank um conjunto de candidatos contra a query. rerank-2-lite é rápido
 * (~150ms) e barato; usar no topo do RAG depois do hybrid search melhora muito
 * a precisão final. Retorna em ordem decrescente de relevância.
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topK: number,
): Promise<RerankResult[]> {
  if (documents.length === 0 || !query.trim()) return [];

  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("VOYAGE_API_KEY not configured");

  const res = await fetch(VOYAGE_RERANK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents,
      top_k: Math.min(topK, documents.length),
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage rerank ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as VoyageRerankResponse;
  return data.data.map((d) => ({ index: d.index, relevanceScore: d.relevance_score }));
}
