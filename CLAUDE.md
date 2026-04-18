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

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

## MCP Servers

| Servidor   | Transporte    | Uso                                                                 |
|------------|---------------|---------------------------------------------------------------------|
| `supabase` | HTTP          | Queries, migrations e edge functions no Supabase remoto             |
| `context7` | stdio (`npx`) | Docs ao vivo: Radix, TanStack Query, Supabase, etc.                 |

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

## Arquivos Protegidos — NÃO EDITAR

- `src/components/ui/*` — shadcn/ui (usar `npx shadcn-ui@latest add <component>`)
- `src/integrations/supabase/types.ts` — gerado automaticamente do schema (após existir)

## Memória e Performance

- Testes: `NODE_OPTIONS='--max-old-space-size=19456'`
- Vitest usa fork pool (max 4 workers)

## CI/CD

`.github/workflows/deploy.yml`: Lint → Test → Build com Bun `--frozen-lockfile`. Deploy pelo Vercel via integração GitHub. `supabase.yml` deploya migrations/functions/types ao push em `supabase/**`.

## Segurança

- Nunca push direto para `main` — feature branches + PR.
- `.env` no `.gitignore`.
- Auth via Supabase com session em localStorage + auto-refresh.

## Modo de discussão

- Quando eu disser "vamos discutir" ou "quero explorar uma ideia", entre em modo de brainstorming: faça perguntas clarificadoras antes de implementar.
- Só comece a codar quando eu disser "pode implementar" ou "vai em frente".
