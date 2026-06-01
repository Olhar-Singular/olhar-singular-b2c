# Orientador Digital B2C

Plataforma educacional B2C (em construção). Stack técnica idêntica à do projeto B2B `orientador-digital` de referência.

## Regra de Commit

**Nunca fazer commit automaticamente.** Sempre aguardar confirmação explícita do usuário após validação e teste manual.

## Comandos Essenciais

### Docker (container do app)

```bash
make up                  # Subir container (build + start)
make down                # Parar container
make rebuild             # Rebuild após mudar dependências
make shell               # Shell dentro do container
make logs                # Logs do container
```

### Dev (rodam dentro do container via make)

```bash
make dev                 # Dev server (Vite, porta 8080)
make build               # Build produção
make lint                # ESLint
make test                # Vitest (single run)
make test-watch          # Vitest (watch mode)
make typecheck           # TypeScript check
```

### Supabase

```bash
make sb-start            # Subir Supabase local
make sb-stop             # Parar Supabase local
make sb-status           # Exibir URLs e keys locais
make sb-reset            # Reset DB local (reaplica migrations)
make sb-login            # Autenticar no Supabase (remoto)
make sb-link             # Vincular ao projeto remoto (requer PROJECT_ID no Makefile)
make db-push             # Aplicar migrations no remoto
make gen-types           # Gerar tipos TypeScript do schema local
make gen-types-remote    # Gerar tipos do schema remoto
make fn-deploy-all       # Deploy de todas as edge functions
make fn-serve            # Servir funções localmente
```

### Atalhos

```bash
make start               # Subir tudo (Supabase local + container app)
make stop                # Parar tudo
```

## Setup Inicial

```bash
# 1. Instalar Supabase CLI
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xz -C ~/.local/bin supabase

# 2. Configurar .env (copiar .env.example)
cp .env.example .env

# 3. Subir
make start

# 4. Copiar keys locais do supabase status para o .env
make sb-status
```

## Stack

| Camada       | Tecnologia                                  |
|-------------|---------------------------------------------|
| Framework   | React 18 + TypeScript 5.8 + Vite 5          |
| Estilo      | Tailwind CSS 3 + shadcn/ui (Radix)          |
| Estado      | TanStack Query (server) + Context (auth)     |
| Backend     | Supabase (auth, DB, edge functions)          |
| Testes      | Vitest + Testing Library + jsdom             |
| Deploy      | Vercel (GitHub Actions)                      |
| Pacotes     | Bun (CI) / npm (dev)                         |

## Variáveis de Ambiente

As variáveis abaixo no `.env` (raiz) apontam para o **Supabase remoto** (produção). Use sempre estes nomes ao referenciar credenciais remotas em scripts, edge functions, comandos ou ferramentas — nunca hardcode URLs/keys.

```bash
VITE_SUPABASE_URL=             # URL do projeto remoto (ex.: https://<project-id>.supabase.co)
VITE_SUPABASE_PUBLISHABLE_KEY= # Anon/publishable key (uso client-side)
VITE_SUPABASE_PROJECT_ID=      # ID do projeto remoto (usado pelo MCP supabase e pelo CLI)
```

Opcionais (descomentar no `.env` quando precisar de acesso direto ao Postgres remoto, fora do client supabase-js):

```bash
DATABASE_PASSWORD=             # Senha do role postgres (remoto)
DATABASE_URL=                  # Connection string completa (remoto)
```

> Para Supabase local (`make sb-start`), o `.env` aponta para `http://localhost:54321` e a anon key vem de `make sb-status`. As mesmas três variáveis (`VITE_SUPABASE_*`) servem aos dois ambientes — o que muda é o conteúdo do `.env`.

### Acesso ao Supabase remoto (referência rápida)

| Ferramenta              | Variável usada                                        |
|-------------------------|-------------------------------------------------------|
| MCP `supabase`          | `VITE_SUPABASE_PROJECT_ID`                            |
| `make sb-link`          | `VITE_SUPABASE_PROJECT_ID` (via Makefile)             |
| `make gen-types-remote` | `VITE_SUPABASE_PROJECT_ID`                            |
| Client supabase-js      | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Conexão Postgres direta | `DATABASE_URL` (ou `DATABASE_PASSWORD`)               |

## MCP Servers

| Servidor   | Transporte    | Uso                                                                                      |
|------------|---------------|------------------------------------------------------------------------------------------|
| `supabase` | HTTP          | Queries, migrations e edge functions no Supabase remoto (usa `VITE_SUPABASE_PROJECT_ID`) |
| `context7` | stdio (`npx`) | Docs ao vivo: Radix, TanStack Query, Supabase, etc.                                      |

Ao usar libs externas complexas, consultar Context7 antes de adivinhar assinaturas (`resolve-library-id` → `query-docs`).

## Estrutura

```
src/
├── components/
│   └── ui/              # shadcn/ui — NÃO EDITAR manualmente
├── integrations/
│   └── supabase/        # Client (regenerar types.ts após primeira migration)
├── lib/                 # utils (cn) e futuros utilitários de domínio
├── App.tsx              # Router + providers
└── main.tsx             # Entry point
```

## Convenções de Código

- **Nomenclatura**: Componentes PascalCase. Hooks `use*`. Utilitários camelCase.
- **Imports**: Alias `@/` para tudo em `src/`. Ordem: React → libs → módulos internos → tipos.
- **Idioma**: UI em pt-BR; código (variáveis, funções, comentários) em inglês.
- **Testes**: ao adicionar o primeiro teste, criar `src/test/setup.ts` com mocks globais (matchMedia, ResizeObserver) e helpers em `src/test/helpers.ts`.

## Fluxo TDD Obrigatório

Toda alteração de código segue **Red → Green → Refactor**:

1. **RED** — Escrever teste que falha. `test: describe failing test for <feature>`
2. **GREEN** — Implementar o mínimo para passar. `feat: implement <feature>`
3. **REFACTOR** — Limpar sem quebrar. Lint + tests limpos. `refactor: clean up <feature>`

Nunca pular uma fase. Nunca editar código sem teste que cubra a mudança.

## Estratégia de Testes em Camadas

O alvo é **100% de cobertura da lógica de negócio, sempre automatizado**. Cada camada tem sua ferramenta — escolha a certa para o que está testando:

| Camada | Ferramenta | Cobre | Comando |
| ------ | --------- | ----- | ------- |
| Lógica/unit (hooks, `lib/domain`, `_shared`) | **Vitest** | cálculo de custo, parsers, orquestração das functions extraída para `_shared/` | `make test` / `npm run test:coverage` |
| Banco / RPC / RLS (`deduct_credits`, `grant_credits`, policies) | **pgTAP** | lock, saldo insuficiente, free-first, segurança RLS | `make test-db` (`supabase test db`) |

Regras:

- **Gate de cobertura 100%** travado em `vitest.config.ts` (statements/branches/functions/lines) — o CI quebra se cair. Mantenha-o em 100%; nunca baixe o threshold para "passar".
- **Exclusões legítimas da cobertura** (código gerado/vendado, sem valor testar): `src/integrations/supabase/types.ts`, `src/components/ui/**`, e os `supabase/functions/**/index.ts` (glue HTTP). **Lógica de verdade não vai em `index.ts`** — extraia para `supabase/functions/_shared/` para que seja coberta pelo Vitest.
- **Lógica sensível a dinheiro/segurança** (RPCs de crédito, RLS) é coberta por **pgTAP**, não por mock — mockar o client não testaria o lock nem as policies reais. Os testes ficam em `supabase/tests/database/*.test.sql`.
- **Enforcement local**: Husky + lint-staged. `pre-commit` roda lint + testes afetados nos arquivos staged; `pre-push` roda `typecheck` + suíte Vitest. (`test-db` exige Docker; roda no CI.)

## Arquivos Protegidos — NÃO EDITAR

- `src/components/ui/*` — shadcn/ui (usar `npx shadcn-ui@latest add <component>`)
- `src/integrations/supabase/types.ts` — gerado automaticamente do schema (após existir)

## Memória e Performance

- Testes: `NODE_OPTIONS='--max-old-space-size=19456'`
- Vitest usa fork pool (max 4 workers)

## CI/CD

`.github/workflows/deploy.yml`: Lint → Test (Vitest com `npm run test:coverage`, **gate de 100% quebra o build**) → Build, instalando deps com `npm ci`. Um job `db-tests` sobe Supabase local (`supabase db start`) e roda os testes pgTAP (`supabase test db`). Deploy pelo Vercel via integração GitHub. `supabase.yml` deploya migrations/functions/types ao push em `supabase/**`.

## Segurança

- Nunca push direto para `main` — feature branches + PR.
- `.env` no `.gitignore`.
- Auth via Supabase com session em localStorage + auto-refresh.

## Modo de discussão

- Quando eu disser "vamos discutir" ou "quero explorar uma ideia", entre em modo de brainstorming: faça perguntas clarificadoras antes de implementar.
- Só comece a codar quando eu disser "pode implementar" ou "vai em frente".
