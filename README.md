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

O endereço local será exibido no terminal.

Para testar o build de produção localmente:

```bash
pnpm build
pnpm start
```

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

Não há chaves ou dados do banco de produção neste repositório.
