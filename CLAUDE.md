# Orientador Digital B2C

Plataforma educacional B2C (em construção). Educadores adaptam atividades pedagógicas
(provas, exercícios) para alunos com **barreiras de aprendizagem** (ex.: TEA) usando IA;
monetização por **créditos** (1ª adaptação grátis, demais debitam). Stack idêntica ao
projeto B2B de referência `orientador-digital`.

## Contexto do projeto

Cada fluxo = uma página + um hook + (geralmente) uma edge function: **Adaptar**, **Perfis
de barreira**, **Banco de questões**, **Chat**, **Créditos**, **Admin**, **Auth**.

→ Mapa de domínio completo (fluxos → página/hook/edge function, onde mora cada camada de
lógica, gotchas de dados como `credit_balance` e `adaptation_result->'document'`):
**skill `dominio-orientador`** (carrega sozinha ao tocar uma área nova).

**Editor do Adaptar — superfície única "Revisar".** O wizard tem **um só** passo de edição
(`src/components/adaptation/steps/review/`): a folha A4 como protagonista, chrome contextual.
Fluxo: `Tipo → Atividade → Barreiras → Gerar → Revisar → Exportar` (os antigos Conteúdo +
Estilo foram fundidos; não existe mais "modo de editor"). Regra mental que governa a
interação: **"Se está impresso na folha, clique e digite. Se é estrutura, abra o card."**
Texto edita inline; formatação de seleção vem do BubbleMenu; aparência do documento (fonte/
tamanho/espaçamento) vem do popover Aparência sobre os page tokens (paridade com o PDF).
Specs do redesign: **`docs/superpowers/specs/2026-06-03-adaptar-restructure-design.md`**.

**Áreas frágeis** — isolar via ferramenta dedicada:

- `src/lib/adaptation/` — documento **canônico** + schema **Tiptap**, **compartilhado com
  a edge fn Deno** (import com extensão `.ts` explícita). Antes de mexer: skill `validate-adaptar`.
- `src/components/adaptation/render/pdf/` — geração de PDF (`@react-pdf/renderer`). Agente `pdf-debugger`.

## Stack

| Camada    | Tecnologia                                |
| --------- | ----------------------------------------- |
| Framework | React 18 + TypeScript 5.8 + Vite 5        |
| Estilo    | Tailwind CSS 3 + shadcn/ui (Radix)        |
| Estado    | TanStack Query (server) + Context (auth)  |
| Backend   | Supabase (auth, DB, edge functions)       |
| Testes    | Vitest + Testing Library + jsdom · pgTAP  |
| Deploy    | Vercel (GitHub Actions) · Bun (CI)/npm    |

## Comandos

Tudo roda dentro do container via `make`. Referência completa: @.claude/docs/commands.md

```bash
make start        # Subir tudo (Supabase local + app)   ·  make stop
make dev          # Dev server (Vite, porta 8080)
make test         # Vitest (single run)                 ·  make test-watch
make test-db      # pgTAP (RPC/RLS) — exige Docker
make lint         # ESLint                              ·  make typecheck
make build        # Build produção
make sb-reset     # Reset DB local (reaplica migrations)
make gen-types    # Gerar tipos do schema local
```

Setup inicial de máquina nova: @.claude/docs/setup.md

## Convenções de Código

- **Nomenclatura**: Componentes PascalCase · Hooks `use*` · Utilitários camelCase.
- **Imports**: alias `@/` para tudo em `src/`. Ordem: React → libs → módulos internos → tipos.
- **Idioma**: UI em pt-BR; código (variáveis, funções, comentários) em inglês.
- **Testes ao lado do arquivo** (`useFoo.test.ts`); `src/test/` guarda só infra global
  (`setup.ts`, `helpers.ts`), fixtures inline no teste. Detalhe: @.claude/docs/testing.md

## Regras Importantes

- **Nunca commit automático.** Sempre aguardar aprovação explícita do usuário após teste
  manual. (Redação da mensagem seguindo a convenção: skill `commit-crafting`.)
- **Nunca push direto para `main`** — feature branch + PR.
- **TDD obrigatório**: toda mudança segue Red → Green → Refactor; nunca editar código sem
  teste que cubra a mudança. Ciclo guiado: comando `/tdd`.
- **Gate de cobertura 100%** (statements/branches/functions/lines) travado em
  `vitest.config.ts` — nunca baixar o threshold. Lógica de dinheiro/segurança (RPCs de
  crédito, RLS) é coberta por **pgTAP**, não por mock. Detalhe: @.claude/docs/testing.md
- **Arquivos protegidos — NÃO EDITAR**: `src/components/ui/*` (shadcn, usar
  `npx shadcn-ui@latest add`), `src/integrations/supabase/types.ts` (gerado do schema).
- **Segredos**: `.env` no `.gitignore`; nunca hardcodar URLs/keys — usar as vars do `.env`.
  Auth via Supabase (session em localStorage + auto-refresh). Detalhe: @.claude/docs/environment.md

## Estrutura (anotações não-óbvias)

Árvore completa: @.claude/docs/architecture.md

- `src/lib/adaptation/` — núcleo do Adaptar (canônico + Tiptap). **Compartilhado c/ Deno.** FRÁGIL.
- `src/components/adaptation/steps/review/` — superfície única "Revisar" (editor canônico +
  Aparência + gaveta de metadados). `canonical-editor/` traz NodeViews, BubbleMenu e o
  inserter "+". Não há mais `steps/content` nem `steps/styling` (fundidos em Revisar).
- `src/components/adaptation/render/pdf/` — geração de PDF. FRÁGIL (agente `pdf-debugger`).
- `src/components/ui/` e `src/integrations/supabase/types.ts` — gerados, **NÃO EDITAR**.
- `supabase/functions/_shared/` — lógica testável das edge fns; `index.ts` é só glue HTTP.
- `supabase/migrations/` — schema + RPCs de crédito + RLS owner-based (super-admin cross-tenant).

## MCP & Docs ao vivo

- `supabase` (HTTP) — queries/migrations/functions no remoto (usa `VITE_SUPABASE_PROJECT_ID`).
- `context7` (stdio) — docs ao vivo (Radix, TanStack Query, Supabase…). Consultar **antes de
  adivinhar** assinaturas de libs externas (`resolve-library-id` → `query-docs`).

## Skills, Agentes e Comandos

| Tipo | Onde | Itens |
| ---- | ---- | ----- |
| Skills | `.claude/skills/` | `dominio-orientador`, `validate-adaptar`, `commit-crafting`, `supabase*` |
| Agentes | `.claude/agents/` | `edge-fn-writer`, `hook-writer`, `migration-reviewer`, `rls-policy-writer`, `test-writer`, `pdf-debugger` |
| Comandos | `.claude/commands/` | `/tdd`, `/plan`, `/ship`, `/debug` |
| Skills vendoradas | `.agents/skills/` | Externas (Supabase) — geridas por `skills-lock.json`, não editar à mão. |

**Manter doc viva (obrigatório):** mexeu numa área que uma skill/agente descreve (caminho,
coluna, contrato, passo de fluxo)? Atualize a skill/agente **na mesma tarefa** — skill
portável `keeping-skills-current`.

## Modo de discussão

- "vamos discutir" / "quero explorar uma ideia" → modo brainstorming: perguntas
  clarificadoras antes de implementar.
- Só comece a codar quando eu disser "pode implementar" / "vai em frente".
