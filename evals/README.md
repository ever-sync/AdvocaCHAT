# Evals da IA do WChat

Casos dourados + LLM-as-judge para detectar regressão de qualidade ao mudar
prompt, modelo ou regras de grounding.

## Rodar localmente

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run eval
```

Sai 0 se o pass-rate ≥ `EVAL_MIN_PASS_RATE` (default 0.85), 1 caso contrário.

### Variáveis úteis

| Var | Default | Uso |
|---|---|---|
| `EVAL_MODEL` | `claude-sonnet-4-6` | Modelo sob teste — bata com o de produção |
| `EVAL_MIN_PASS_RATE` | `0.85` | Threshold de pass-rate |
| `EVAL_VERBOSE` | off | Imprime resposta + reasoning do juiz em cada caso |

## Adicionar casos

Edite `evals/cases.json`. Cada caso tem:

- `id` — slug curto, único
- `title` — descrição humana do que se quer testar
- `knowledge` — array de chunks "como se viessem do RAG" (vazio = sem base)
- `messages` — histórico (apenas user; assistant entra na próxima rodada)
- `rubric` — array de afirmações que a resposta DEVE atender (todas precisam passar)

A rubrica é avaliada por Claude Sonnet 4.6 atuando como juiz. Use frases
**verificáveis**: "A resposta cita o preço R$199" é melhor que "A resposta
é boa".

## Importante: paridade com produção

`evals/run.js` duplica `GROUNDING_RULES`, `DEFAULT_PERSONA` e a lista de
tools de `supabase/functions/ai-orchestrator/index.ts`. Qualquer mudança
nessas constantes precisa ser refletida aqui — senão a eval mede o prompt
errado.

## Custo

Cada caso custa ~1 chamada Sonnet (ator) + 1 chamada Sonnet (juiz) ≈
US$ 0.005-0.015. Com 8 casos, ~US$ 0.05-0.10 por rodada.
