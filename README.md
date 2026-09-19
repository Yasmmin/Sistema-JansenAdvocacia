# Jansen | Monitor DJEN

Sistema interno para consultar, armazenar e organizar publicações oficiais do DJEN vinculadas à OAB/RS 103.774, clientes, processos e tarefas.

## Tecnologias

- React e TypeScript
- Next.js com Vinext
- Tailwind CSS
- Cloudflare Workers e D1
- Drizzle ORM

## Execução local

Requisitos: Node.js 22 ou superior e pnpm 11.

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

O sistema ficará disponível em `http://127.0.0.1:8787/`.

Para testar o build de produção localmente:

```bash
pnpm build
pnpm start
```

## Configuração do Google Calendar

A integração com o Google Calendar depende das variáveis de ambiente do Worker. Para rodar localmente, crie um arquivo `.dev.vars` na raiz do projeto com as chaves do OAuth do Google:

```bash
cp .dev.vars.example .dev.vars
```

Conteúdo esperado:

```bash
GOOGLE_CLIENT_ID="seu_client_id"
GOOGLE_CLIENT_SECRET="seu_client_secret"
GOOGLE_OAUTH_REDIRECT_URI="http://127.0.0.1:8787/api/calendar/google/callback"
GOOGLE_TOKEN_ENCRYPTION_KEY="uma-chave-secreta-forte-para-criptografar-o-refresh-token"
GOOGLE_CALENDAR_WEBHOOK_URL="http://127.0.0.1:8787/api/calendar/google/webhook"
GOOGLE_CALENDAR_DEFAULT_ID="seu-email-google"
GOOGLE_CALENDAR_INCLUDED_IDS="seu-email-google"
DATAJUD_API_KEY="sua-chave-da-api-publica-datajud"
```

Se o projeto for executado em produção, esses valores devem ser configurados no ambiente do Cloudflare Worker como secrets/vars, não como constantes no código.

## Banco de dados

O projeto usa Cloudflare D1, baseado em SQLite. O schema está em `db/schema.ts` e as migrations estão em `drizzle/`.

Após alterar o schema:

```bash
pnpm db:generate
pnpm db:migrate:local
```

O banco local fica em `.wrangler/` e não é versionado.

## Integração DJEN

A consulta usa o endpoint público `https://comunicaapi.pje.jus.br/api/v1/comunicacao`, com validação da OAB e UF dentro dos dados estruturados de advogados retornados pela API.

O fluxo de sincronização:

1. consulta todas as páginas do período;
2. valida a OAB monitorada;
3. normaliza os registros;
4. calcula um fingerprint SHA-256;
5. insere somente publicações inéditas;
6. preserva alterações administrativas feitas no sistema.

Credenciais reais devem permanecer apenas em `.dev.vars` no ambiente local e nos secrets do Cloudflare em produção.
