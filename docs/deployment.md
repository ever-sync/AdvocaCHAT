# Implantação AdvocaCHAT — 2026-09-10

Instalação independente no workspace EverSync, projeto AdvocaCHAT, ambiente production.
A pasta de origem ChatJus foi preservada; a cópia de trabalho está em AdvocaCHAT.

## Serviços e operação

- Web: React/Vite, Node 22, servidor stateless, duas réplicas.
- Functions: Supabase Edge Runtime, duas réplicas, porta 9000, escuta IPv6.
- Scheduler: um processo, sem volume, ciclos sequenciais com timeout e registro de heartbeat no banco.
- Postgres: volume persistente de 50 GB provisionado pelo template, uma instância.
- Supavisor: pool de conexões separado.
- Auth, REST, Realtime, Storage e gateway separados. Storage usa bucket S3 do Railway.
- Studio e Postgres Meta sem domínio público próprio. O gateway autentica acesso ao Studio.
- Backups do volume Postgres: DAILY, WEEKLY e MONTHLY, confirmados pela API.

O banco ainda é uma instância única. Réplicas de aplicação não representam alta
disponibilidade do banco. Aumento de capacidade deve seguir métricas de CPU,
memória, conexões, latência e atraso das filas; não foi executado teste de carga.

## Correções da base

Removidos o fallback para Supabase de outro produto, scripts/backups externos,
bootstrap de instância RecupereiBR e concessão automática de administrador por e-mail.
A identidade inicial foi alterada para AdvocaCHAT. O build rejeita falta de backend,
mock auth e uso de chave administrativa no frontend. Credenciais geradas ficam no Railway.

O template exigiu configuração explícita das chaves JWT, PGRST_JWT_SECRET no storage,
PGRST_SERVER_HOST=*6 no REST e --ip :: no Edge Runtime para a rede privada.

## Verificação

- TypeScript e build passaram.
- 442 testes, em 62 arquivos, passaram.
- Lint: nenhum erro; 31 avisos herdados.
- Login renderizado no navegador.
- Dois usuários de teste criaram escritórios independentes e autenticaram.
- Cliente gravado e relido pelo próprio escritório; leitura por outro escritório e
  por usuário anônimo retornou lista vazia.
- Health das funções confirmou acesso real ao banco pelo gateway.

## Pendências de operação

Domínio definitivo, e-mail do administrador e SMTP/Resend do novo produto precisam
ser definidos. Confirmação de cadastro e recuperação de senha exigem entrega real de e-mail.
WhatsApp, IA, pagamentos e Google Calendar precisam das credenciais desta operação;
não foram vinculadas contas de outros clientes. Testes de entrega desses provedores
ficam pendentes. Não foram implementados módulos de processo judicial ou prazos.

## Referências

- https://docs.railway.com/guides/supabase
- https://docs.postgrest.org/en/v14/references/configuration.html#server-host
