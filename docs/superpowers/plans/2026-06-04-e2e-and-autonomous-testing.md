# Plano — Testes E2E + Validação Autônoma do Agente

> Objetivo: dar ao agente **máxima autonomia** para validar mudanças de ponta a ponta (UI → API → banco → IA), e fechar a classe de bug que **cobertura unitária 100% não pega**. Escrito após a sessão de 2026-06-04, que validou o fluxo "Adaptar" no Docker local + Gemini real e **encontrou 2 bugs críticos invisíveis aos 1684 testes unitários**.

## Por que (as lições desta sessão)

Os testes unitários estão em 100% de cobertura e mesmo assim deixaram passar bugs que quebrariam produção:

1. **Editor crashava ao renderizar** (`node.type.spec.toDOM is not a function`) — porque os testes de componente **mockam `@tiptap/react`**, então o ProseMirror/DOMSerializer real nunca roda. O round-trip usa `toJSON` (não `toDOM`). Só apareceu ao montar o editor no browser real.
2. **Edge function não bundlava no Deno** (`Module not found ".../canonical/colors"`) — porque o pacote importava sem extensão `.ts` (Vite resolve, Deno não). Vitest roda no Vite → nunca pega. Só apareceu ao rodar `supabase functions serve`.

**Conclusão:** mock esconde integração. Precisamos de (a) testes que exercitem o **render real do Tiptap** e o **bundle Deno real**, e (b) um **fluxo E2E** no browser, e (c) **skills** para o agente rodar tudo isso sozinho.

## Componentes do plano

### 1. Smoke tests de integração "sem mock" (rápidos, no Vitest) — PRIORIDADE
Fecham a maior parte do gap sem precisar de browser. Já existe um exemplo nesta sessão: `src/lib/adaptation/tiptap/domSerialization.test.ts` (serializa o schema real pro DOM). Expandir:
- **`CanonicalEditor` real (sem mockar `@tiptap/react`):** um teste que monta o editor de verdade com um documento-fixture e afirma "não crasha + renderiza N questões". jsdom suporta ProseMirror. Isso teria pego o bug #1 diretamente. Manter num arquivo separado (`*.realdom.test.tsx`) que NÃO aplica o mock global de tiptap.
- **Renderer + PDF mapper:** já há snapshots de paridade; adicionar um que renderiza o documento-fixture de verdade.
- **Deno bundle check:** script `scripts/check-deno-bundle.sh` que roda `supabase functions serve <fn>` (ou `deno check`) e faz um POST smoke; falha se houver erro de módulo/boot. Rodar no CI (`db-tests` job já sobe Supabase local).

### 2. Playwright E2E (repetível, CI + manual)
Instalar `@playwright/test` (separado do Vitest). Estrutura:
- `e2e/` com specs: `adaptar-happy-path.spec.ts` (signup → tipo → atividade → barreiras+perfil → gerar → **editor renderiza** → estilizar → exportar → salvar → reabrir do histórico → edições preservadas).
- **Dois modos de IA:**
  - **CI/determinístico:** interceptar `**/functions/v1/adapt-activity` com `page.route` e devolver um `AdaptationResult` canônico fixo (rápido, sem custo Gemini, sem flutuação). Cobre tudo MENOS a IA.
  - **Nightly/manual (real):** sem stub, contra Supabase local + `AI_API_KEY` real. Cobre o contrato structured-output do Gemini de verdade (1 geração).
- **Ambiente:** `playwright.config.ts` com `webServer` subindo `npm run dev` + `supabase functions serve`; `.env.local` apontando pro Supabase local (já criado nesta sessão, gitignored).
- **Seed determinístico** (ver §4): usuário de teste + créditos + 1 perfil de barreira, via SQL/API, para o fluxo ser alcançável sem cliques manuais de setup.
- Rodar no CI num job dedicado (browsers cacheados). Modo stub no PR, modo real no nightly.

### 3. `data-testid` nos âncoras do fluxo
Adicionar `data-testid` estáveis (não trocam com refactor de texto) nos pontos-chave, para Playwright E2E **e** para o agente dirigir via `evaluate_script` sem depender de texto/role:
- Wizard: `data-testid="wizard-step-{key}"` no container do passo; botões `adapt-next`, `adapt-back`, `adapt-generate`, `adapt-save`, `adapt-regenerate`.
- Editor: `data-testid="canonical-editor"`; NodeViews de questão `question-node`, imagem `image-node`, math `math-node`.
- Estilização: `styling-surface`, `styling-preview`.
- Export: `export-pdf`, `export-copy`.
- Barreiras: `barrier-profile-select`, `barrier-edit`, `barrier-item-{key}`.
> Convenção: só nos pontos que o E2E/agente precisa ancorar — não espalhar.

### 4. Helpers de ambiente (Makefile)
Para o agente (e o E2E) chegarem ao fluxo sem setup manual:
- `make e2e-seed` — cria usuário de teste (auth API), garante créditos, insere 1 perfil de barreira. Idempotente. (Nesta sessão isso foi feito à mão via psql/curl — automatizar.)
- `make e2e-up` — `sb-start` + `functions serve` (com `.env` da IA) + `dev`, em background, e espera ficarem prontos.
- `make e2e-down` — derruba dev/serve, opcional `db reset`.
- `make verify-adaptar` — pipeline completo: `sb-reset` → `gen-types` → `test` (Vitest) → `test-db` (pgTAP) → `check-deno-bundle` → Playwright (modo stub). Um comando = validação total.

### 5. Skills de autonomia para o agente
Criar skills do projeto (`.claude/skills/` ou comandos) para o agente validar/analisar sozinho:
- **`/validate-adaptar`** — roda `make verify-adaptar`, lê os resultados, e em caso de falha analisa o log e propõe o fix. Encapsula a sequência desta sessão.
- **`/drive-app`** — guia de como dirigir a UI via `evaluate_script` (NÃO `take_snapshot`, que é lento/caro): padrões de "click por texto/testid", "preencher input controlado React via native setter + dispatch", "poll até spinner sumir", "ler console.error após ação". Documenta os truques aprendidos (select nativo vs Radix, checkbox Radix travado por perfil → "Editar", etc.).
- **`/check-real-render`** — lembra de SEMPRE checar `list_console_messages({types:["error"]})` após uma ação de UI, porque error boundaries engolem o erro visualmente mas o console mostra o stack (foi assim que o bug #1 foi diagnosticado).
- **`/e2e-flow`** — escreve/atualiza um spec Playwright a partir de uma descrição de fluxo.

### 6. Anti-padrões a corrigir no test setup
- O mock global de `@tiptap/react` em `src/test/setup.ts` (se existir) deve coexistir com testes "real DOM" que o **desabilitam** localmente (`vi.unmock` ou arquivo fora do escopo do mock). Garantir que pelo menos UM teste por NodeView monte o Tiptap real.
- Adicionar ao gate de CI: o `check-deno-bundle` (senão qualquer import novo de `src/` numa edge function pode quebrar deploy silenciosamente).

## Faseamento sugerido
1. **Fase 1 (rápida, alto valor):** smoke "real DOM" do `CanonicalEditor` + `check-deno-bundle.sh` no CI. Fecha as 2 classes de bug desta sessão sem browser.
2. **Fase 2:** `data-testid` nos âncoras + `make e2e-seed`/`e2e-up`/`e2e-down`.
3. **Fase 3:** Playwright + spec happy-path (modo stub no PR).
4. **Fase 4:** skills `/validate-adaptar`, `/drive-app`, `/e2e-flow` + nightly real.

## Riscos
- Playwright em CI exige browsers (cachear; ~100MB). Job separado.
- E2E real (Gemini) é lento/flutuante → só nightly/manual, nunca bloqueia PR.
- jsdom não é 100% fiel ao browser (CSS/layout). Smoke "real DOM" cobre estrutura/render, não pixel — o pixel fica no Playwright.

## Estado atual (o que já existe desta sessão)
- `.env.local` apontando pro Supabase local (gitignored).
- `src/lib/adaptation/tiptap/domSerialization.test.ts` — o primeiro smoke "real DOM" (modelo a expandir).
- Fluxo validado manualmente: signup, wizard, geração Gemini real, render do editor, autosave→DB, crédito. Documentado na memória do projeto.
