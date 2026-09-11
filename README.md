# AdvocaCHAT

CRM e atendimento para escritórios de advocacia, derivado da base CaleoCRM.
Esta instalação possui infraestrutura e credenciais próprias. Não importa clientes,
usuários, canais ou automações de instalações anteriores.

## Desenvolvimento

Use Node.js 22. Copie `.env.example` para `.env`, configure o backend desta instalação,
execute `npm ci` e `npm run dev`. O build de produção exige URL e chave pública do
Supabase e rejeita autenticação simulada e chaves administrativas.

Validação: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Infraestrutura

Projeto Railway: https://railway.com/project/f5af8047-0621-424a-aade-2f6d99853bd5
Ambiente: production (`c0311f6c-a018-4c50-aedf-00f214a05470`).
Frontend: https://web-production-ee184.up.railway.app
Gateway: https://envoy-production-ca47.up.railway.app

Serviços: web, functions, Envoy, Postgres, Postgrest, Gotrue Auth,
Supabase Realtime, Supabase Storage, Supavisor, Postgres Meta e Supabase Studio.
Storage usa um bucket S3 do Railway. Studio fica sem domínio próprio; o gateway
protege o acesso administrativo com autenticação. As chaves ficam nas variáveis do Railway.

O frontend é stateless e usa `npm run build` / `npm start`. As funções usam
`infra/functions/Dockerfile`, porta 9000 e escuta IPv6 (`--ip ::`). O dispatcher
lê `supabase/config.toml`; funções sem dispensa explícita exigem JWT.

Migrations: com PGHOST, PGPORT, PGUSER, PGPASSWORD e PGDATABASE definidos para o
banco correto, execute `python3 scripts/migrate.py`. O ledger registra versões
aplicadas. Não reutilize banco nem credenciais de outros clientes.

A configuração operacional e os resultados da validação estão em `docs/deployment.md`.

## Escopo do produto

A base entrega clientes, atendimento, CRM, documentos, agenda e permissões por escritório.
A fase 1 adiciona a área **Casos jurídicos**, com clientes, partes, processos
cadastrados manualmente, responsáveis, participantes, histórico e documentos
restritos por caso e categoria. Veja a [entrega e operação da fase 1](docs/FASE_1_NUCLEO_JURIDICO.md).
Integrações com tribunais e cálculo de prazos judiciais pertencem às próximas fases. Provedores de WhatsApp, e-mail, IA e pagamentos precisam ser
configurados especificamente para esta operação.

O [plano de evolução da plataforma jurídica e da especialidade de isenção de IR](docs/PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md)
organiza o trabalho futuro por fases, com funcionalidades, dependências e critérios
de conclusão. O documento é um roteiro; não indica que essas funções já estejam implementadas.
