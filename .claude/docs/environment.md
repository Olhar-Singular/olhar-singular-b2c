# Variáveis de Ambiente

As variáveis no `.env` (raiz) apontam para o **Supabase remoto** (produção). Use sempre
estes nomes ao referenciar credenciais remotas em scripts, edge functions, comandos ou
ferramentas — **nunca hardcode URLs/keys**.

```bash
VITE_SUPABASE_URL=             # URL do projeto remoto (ex.: https://<project-id>.supabase.co)
VITE_SUPABASE_PUBLISHABLE_KEY= # Anon/publishable key (uso client-side)
VITE_SUPABASE_PROJECT_ID=      # ID do projeto remoto (usado pelo MCP supabase e pelo CLI)
```

Opcionais (descomentar quando precisar de acesso direto ao Postgres remoto, fora do client supabase-js):

```bash
DATABASE_PASSWORD=             # Senha do role postgres (remoto)
DATABASE_URL=                  # Connection string completa (remoto)
```

> **Um único `.env`** na raiz é a fonte de verdade: serve o app (Vite) **e** as edge
> functions locais (`make fn-serve` lê o `.env` raiz — não há mais `supabase/functions/.env`).
> Guarda também os segredos de backend (`AI_API_KEY`, `MP_*`, `STRIPE_*`, sem prefixo
> `VITE_`). As `VITE_SUPABASE_*` servem aos dois ambientes — o que muda é o conteúdo.
>
> Para apontar o app pro **Supabase local** sem editar o `.env`, a skill `validate-adaptar`
> cria um `.env.local` **efêmero** (o Vite prioriza, é gitignored) e o **remove no cleanup**
> (`rm -f .env.local`). Se você encontrar um `.env.local` solto na árvore, é resíduo de uma
> validação — pode apagar.

## Acesso ao Supabase remoto (referência rápida)

| Ferramenta              | Variável usada                                        |
| ----------------------- | ----------------------------------------------------- |
| MCP `supabase`          | `VITE_SUPABASE_PROJECT_ID`                            |
| `make sb-link`          | `VITE_SUPABASE_PROJECT_ID` (via Makefile)             |
| `make gen-types-remote` | `VITE_SUPABASE_PROJECT_ID`                            |
| Client supabase-js      | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Conexão Postgres direta | `DATABASE_URL` (ou `DATABASE_PASSWORD`)               |
