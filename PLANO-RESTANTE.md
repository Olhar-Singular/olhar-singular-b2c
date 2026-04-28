# Plano restante — Orientador Digital B2C

> **Contexto**: P0, P1 e P2 do plano original já foram executados nesta sessão (helpers de teste, deduplicação, cobertura crítica, reorganização de pastas). Este documento contém **o que ainda falta**.
>
> **Estado atual** (validado):
> - 34 suites / 268 testes verdes, lint 0 erros + 1 warning legado, typecheck OK.
> - **Coverage atual: ~30%** (statements 29.32%, branches 29.25%, functions 28.60%, lines 30.45%).
> - **Meta declarada pelo usuário: 100% de coverage. Tudo testado.**
>
> **Working tree**: 78 arquivos alterados sem commit. Decisão: revisar e commitar P0+P1+P2 antes de iniciar P3.

---

## Pré-requisito — Commit do trabalho atual

Antes de avançar para P3, decidir estratégia de commit dos 78 arquivos alterados:

- **Opção A (recomendada)**: 3 commits temáticos
  1. `refactor(test): adiciona helpers.ts e endurece testes superficiais` (P0.1 + P1.2 + P1.3)
  2. `refactor(types,lib): deduplica QuestionType e SUBJECTS` (P0.2 + P0.3)
  3. `test: cobre 10 módulos críticos sem cobertura` (P1.1)
  4. `refactor(structure): reorganiza components em forms/dialogs/common e lib em domain/utils` (P2.1 + P2.2 + P2.3)
- **Opção B**: 1 commit único `refactor: aplica P0+P1+P2 do plano de revisão estrutural`.

Critério: opção A facilita rollback granular; opção B reduz ruído no histórico.

---

## P-COVERAGE — Atingir 100% de cobertura (PRIORIDADE MÁXIMA, declarada pelo usuário)

> **Premissa de "100%"**: alvo é **100% efetivo** — toda linha de código que pode rodar em ambiente de teste tem teste; linhas que comprovadamente não podem rodar em jsdom (ex.: integrações com browser real, polyfills de runtime Deno) ficam excluídas explicitamente em `vitest.config.ts` ou marcadas com `/* v8 ignore next */` com comentário justificando o porquê. Sem isso, 100% literal vira teatro de cobertura (testes inúteis cobrindo branches inalcançáveis).
>
> **Pré-requisitos**:
> 1. Executar **P3.1 antes** (remover 25 shadcn não usados) — senão estamos cobrindo código que vai ser deletado.
> 2. Executar **D1 antes** (decidir destino dos 3 componentes órfãos) — mesma razão.
> 3. Atualizar `vitest.config.ts` com:
>    - Script `test:coverage` no package.json: `vitest run --coverage`.
>    - Threshold subindo gradualmente conforme as fases (50 → 70 → 85 → 95 → 100) para não bloquear progresso.
>    - Excluir explicitamente: arquivos puramente declarativos (`src/types/*.ts` que só exportam tipos), `src/main.tsx` (entry point), `src/integrations/supabase/types.ts` (gerado), `src/vite-env.d.ts`.
>
> **Total a cobrir** (após P3.1 e D1): ~60 arquivos `src/` + ~10 edge functions Deno.
>
> **Estimativa total agregada**: 8-12 sprints (~40-80 horas de trabalho focado).

### P-COV.0 — Setup de infraestrutura

1. Adicionar script: `"test:coverage": "NODE_OPTIONS='--max-old-space-size=19456' vitest run --coverage"`.
2. Atualizar [vitest.config.ts](vitest.config.ts):
   - Excluir `src/types/**`, `src/lib/dsl/types.ts` (apenas tipos), `src/components/ui/**` (shadcn não autoral), `src/integrations/supabase/client.ts` (factory trivial wrapper).
   - Subir thresholds para começar — alinhar com cobertura alcançada após cada fase.
3. Adicionar passo no CI ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)): rodar `npm run test:coverage` e falhar se thresholds caírem.
4. Adicionar [coverage/](coverage/) ao [.gitignore](.gitignore) (relatório gerado).

**Esforço**: 30 min.

### P-COV.1 — Domínio puro (alta densidade, alta confiança)

Arquivos puros que dão **muito coverage por linha de teste**:

| Arquivo | Cov atual | Alvo | Esforço |
|---|---|---|---|
| [src/lib/domain/activityParser.ts](src/lib/domain/activityParser.ts) | 53% | 100% | 4-6h (DSL parser complexo, ~500 linhas, muitos branches por tipo de questão) |
| [src/lib/domain/activityDslConverter.ts](src/lib/domain/activityDslConverter.ts) | 55% | 100% | 4-6h (espelho do parser, igualmente complexo) |
| [src/lib/domain/streamAI.ts](src/lib/domain/streamAI.ts) | 64% | 100% | 1h (cobrir branches de buffer SSE residual L73-90) |
| [src/lib/domain/latexRenderer.ts](src/lib/domain/latexRenderer.ts) | 76% | 100% | 1h (cobrir fallback de erro KaTeX, displayMode) |
| [src/lib/domain/activityFormatter.ts](src/lib/domain/activityFormatter.ts) | 87% | 100% | 30 min (3 linhas de fallback) |
| [src/lib/domain/parseMarkdownInline.ts](src/lib/domain/parseMarkdownInline.ts) | 97% | 100% | 15 min (1 linha) |
| [src/lib/domain/questionParser.ts](src/lib/domain/questionParser.ts) | já bem coberto | 100% | 1h |
| [src/lib/utils/extraction-utils.ts](src/lib/utils/extraction-utils.ts) | 34% | 100% | 2h (helpers de pdf/file) |
| [src/lib/utils/fileValidation.ts](src/lib/utils/fileValidation.ts) | já coberto | 100% | 30 min |
| [src/lib/utils/fileNameUtils.ts](src/lib/utils/fileNameUtils.ts) | 100% | mantém | 0 |
| [src/lib/utils/htmlText.ts](src/lib/utils/htmlText.ts) | 100% | mantém | 0 |
| [src/lib/utils/constants.ts](src/lib/utils/constants.ts) | dados puros | excluir do coverage ou snapshot | 0 |
| [src/lib/utils.ts](src/lib/utils.ts) (cn) | 100% | mantém | 0 |
| [src/lib/utils/docx-utils.ts](src/lib/utils/docx-utils.ts) | 0% | 100% | 2h (mockar `mammoth`) |
| [src/lib/utils/pdf-utils.ts](src/lib/utils/pdf-utils.ts) | 0% | 100% | 3h (mockar `pdfjs-dist`, requer worker setup) |
| [src/types/adaptation.ts](src/types/adaptation.ts) | 71% (type guards) | 100% | 30 min (cobrir `isStructuredActivity` em todos os branches) |
| [src/types/chat.ts](src/types/chat.ts) | só tipos | excluir | 0 |
| [src/lib/dsl/types.ts](src/lib/dsl/types.ts) | 0% | 100% | 2h (parsers `toCanonicalDsl`, `toRawDsl`) |
| [src/lib/tiptap/latexExtension.ts](src/lib/tiptap/latexExtension.ts) | 0% | 100% | 2h (extension TipTap, requer mock de editor) |
| [src/lib/domain/adaptationWizardHelpers.ts](src/lib/domain/adaptationWizardHelpers.ts) | já 100% | mantém | 0 |
| [src/lib/domain/barriers.ts](src/lib/domain/barriers.ts) | já 100% | mantém | 0 |
| [src/lib/domain/normalizeAIText.ts](src/lib/domain/normalizeAIText.ts) | já 100% | mantém | 0 |

**Subtotal P-COV.1**: ~20-25 horas.

### P-COV.2 — Hooks (state machines críticos)

| Arquivo | Cov atual | Alvo | Esforço |
|---|---|---|---|
| [src/hooks/useActivityContent.ts](src/hooks/useActivityContent.ts) | 0% | 100% | 3h (state machine com `useHistory`, depende de `dsl/types`) |
| [src/hooks/useChatSessions.ts](src/hooks/useChatSessions.ts) | 80% | 100% | 30 min |
| [src/hooks/useCredits.ts](src/hooks/useCredits.ts) | 92% | 100% | 30 min |
| [src/hooks/useBarrierProfiles.ts](src/hooks/useBarrierProfiles.ts) | 79% | 100% | 1h |
| [src/hooks/useQuestionBank.ts](src/hooks/useQuestionBank.ts) | 96% | 100% | 30 min |
| [src/hooks/useRegenerateQuestion.ts](src/hooks/useRegenerateQuestion.ts) | 82% | 100% | 1h |
| [src/hooks/useSendMessage.ts](src/hooks/useSendMessage.ts) | 92% | 100% | 30 min |
| [src/hooks/useHistory.ts](src/hooks/useHistory.ts) | 100% | mantém | 0 |
| [src/hooks/useAuth.ts](src/hooks/useAuth.ts) | 100% | mantém | 0 |

**Subtotal P-COV.2**: ~7-8 horas.

### P-COV.3 — Contexts e integrações

| Arquivo | Cov atual | Alvo | Esforço |
|---|---|---|---|
| [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) | 93% | 100% | 1h (cobrir `signOut` no L46 e L55) |
| [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts) | trivial | excluir do coverage | 0 |

**Subtotal P-COV.3**: ~1 hora.

### P-COV.4 — Componentes de domínio (forms, dialogs, common, editor)

| Arquivo | Cov atual | Alvo | Esforço |
|---|---|---|---|
| [src/components/common/CreditBalance.tsx](src/components/common/CreditBalance.tsx) | já 100% | mantém | 0 |
| [src/components/common/ProtectedRoute.tsx](src/components/common/ProtectedRoute.tsx) | já 100% | mantém | 0 |
| [src/components/common/Layout.tsx](src/components/common/Layout.tsx) | 0% | 100% | 1h (sidebar, navegação) |
| [src/components/forms/BarrierProfileForm.tsx](src/components/forms/BarrierProfileForm.tsx) | 0% | 100% | 3h (formulário com Zod, dimensões dinâmicas) |
| [src/components/forms/QuestionForm.tsx](src/components/forms/QuestionForm.tsx) | 0% | 100% | 3h (CRUD de questão, upload de imagem) |
| [src/components/forms/ManualQuestionEditor.tsx](src/components/forms/ManualQuestionEditor.tsx) | 0% | 100% | 5h (componente grande, parsing de PDF/DOCX) |
| [src/components/forms/QuestionRichEditor.tsx](src/components/forms/QuestionRichEditor.tsx) | 0% | 100% | 3h (TipTap, mock de editor) |
| [src/components/dialogs/FilePreviewModal.tsx](src/components/dialogs/FilePreviewModal.tsx) | 0% | 100% ou deletar (D1) | 2h |
| [src/components/dialogs/ImageCropperModal.tsx](src/components/dialogs/ImageCropperModal.tsx) | 0% | 100% ou deletar (D1) | 2h |
| [src/components/dialogs/ImagePreviewDialog.tsx](src/components/dialogs/ImagePreviewDialog.tsx) | 0% | 100% | 1h |
| [src/components/dialogs/PdfPreviewModal.tsx](src/components/dialogs/PdfPreviewModal.tsx) | 0% | 100% | 2h |
| [src/components/dialogs/QuestionExtractModal.tsx](src/components/dialogs/QuestionExtractModal.tsx) | 0% | 100% | 3h (extração com loading e erro) |
| [src/components/editor/ActivityEditor.tsx](src/components/editor/ActivityEditor.tsx) | 0% | 100% | 4h (editor central) |
| [src/components/editor/ActivityPreview.tsx](src/components/editor/ActivityPreview.tsx) | 0% | 100% | 3h (renderização de DSL) |
| [src/components/editor/ActivityStatusBar.tsx](src/components/editor/ActivityStatusBar.tsx) | 0% | 100% | 1h |
| [src/components/editor/EditorToolbar.tsx](src/components/editor/EditorToolbar.tsx) | 0% | 100% | 2h |
| [src/components/editor/ImageManagerModal.tsx](src/components/editor/ImageManagerModal.tsx) | 0% | 100% | 3h |
| [src/components/editor/ImageResizer.tsx](src/components/editor/ImageResizer.tsx) | 0% | 100% | 2h |
| [src/components/editor/imageManagerUtils.ts](src/components/editor/imageManagerUtils.ts) | 0% | 100% | 1h (utils puros) |
| [src/components/landing/*](src/components/landing/) (7 componentes) | 0% (mas testados via LandingPage) | 100% | 3h (testes diretos por seção) |
| [src/components/chat/ChatSidebar.tsx](src/components/chat/ChatSidebar.tsx) | já testado | levar a 100% | 1h |
| [src/components/chat/ChatWindow.tsx](src/components/chat/ChatWindow.tsx) | já testado | levar a 100% | 1h |
| [src/components/adaptation/AdaptationWizard.tsx](src/components/adaptation/AdaptationWizard.tsx) | já testado | levar a 100% | 2h |
| [src/components/adaptation/steps/activity-input/StepActivityInput.tsx](src/components/adaptation/steps/activity-input/StepActivityInput.tsx) | parcial | 100% | 1h |
| [src/components/adaptation/steps/activity-type/StepActivityType.tsx](src/components/adaptation/steps/activity-type/StepActivityType.tsx) | 0% | 100% | 1h |
| [src/components/adaptation/steps/ai-editor/StepAIEditor.tsx](src/components/adaptation/steps/ai-editor/StepAIEditor.tsx) | 0% | 100% | 4h (streaming, créditos, erros) |
| [src/components/adaptation/steps/barriers/StepBarrierSelection.tsx](src/components/adaptation/steps/barriers/StepBarrierSelection.tsx) | parcial | 100% | 1h |
| [src/components/adaptation/steps/choice/StepChoice.tsx](src/components/adaptation/steps/choice/StepChoice.tsx) | 0% | 100% | 1h |
| [src/components/adaptation/steps/editor/StepEditor.tsx](src/components/adaptation/steps/editor/StepEditor.tsx) | 0% | 100% | 3h (integra editor + history) |
| [src/components/adaptation/steps/export/StepExport.tsx](src/components/adaptation/steps/export/StepExport.tsx) | parcial | 100% | 1h |

**Subtotal P-COV.4**: ~55-60 horas.

### P-COV.5 — Pages

| Arquivo | Cov atual | Alvo | Esforço |
|---|---|---|---|
| [src/pages/LandingPage.tsx](src/pages/LandingPage.tsx) | já bom | 100% | 30 min |
| [src/pages/AuthPage.tsx](src/pages/AuthPage.tsx) | 78% | 100% | 1h |
| [src/pages/AdaptarPage.tsx](src/pages/AdaptarPage.tsx) | 0% | 100% | 2h (route shell) |
| [src/pages/BarrierProfilesPage.tsx](src/pages/BarrierProfilesPage.tsx) | 71% | 100% | 1h |
| [src/pages/ChatPage.tsx](src/pages/ChatPage.tsx) | 0% | 100% | 4h (chat full flow) |
| [src/pages/CreditsPage.tsx](src/pages/CreditsPage.tsx) | 100% | mantém | 0 |
| [src/pages/DashboardPage.tsx](src/pages/DashboardPage.tsx) | 0% | 100% | 3h (cards + navegação) |
| [src/pages/QuestionBankPage.tsx](src/pages/QuestionBankPage.tsx) | 52% | 100% | 4h (filtros, busca, CRUD) |

**Subtotal P-COV.5**: ~15-16 horas.

### P-COV.6 — App.tsx (root)

| Arquivo | Cov atual | Alvo | Esforço |
|---|---|---|---|
| [src/App.tsx](src/App.tsx) | 0% | 100% | 2h (roteamento + providers) |

**Subtotal P-COV.6**: 2h.

### P-COV.7 — Edge functions Deno (separado, runtime distinto)

10 arquivos `.ts` em `supabase/functions/`. Hoje **0% de cobertura** porque Vitest não roda Deno.

**Estratégia**:
- Usar `deno test --coverage` nativo.
- Mockar `Deno.env.get`, `fetch`, `createClient` do supabase via dependency injection ou `import.meta.url` overrides.
- Adicionar GitHub Action separada que roda em paralelo ao job de Vitest.

| Arquivo | Esforço |
|---|---|
| `_shared/aiConfig.ts` | 1h |
| `_shared/sanitize.ts` | 1h |
| `_shared/logAiUsage.ts` | 2h |
| `adapt-activity/index.ts` | 4h (streaming SSE, prompts) |
| `chat/index.ts` | 4h (streaming, contexto) |
| `check-and-deduct-credits/index.ts` | 2h |
| `create-checkout/index.ts` | 3h (Mercado Pago integration) |
| `extract-questions/index.ts` | 4h (OCR/parsing pipeline) |
| `regenerate-question/index.ts` | 3h |
| `mp-webhook/index.ts` | 3h (HMAC verify, payment flow) |

**Subtotal P-COV.7**: ~27 horas.

---

### Total estimado para 100% de cobertura

| Bloco | Esforço |
|---|---|
| P-COV.0 setup | 0.5h |
| P-COV.1 domain puro | 20-25h |
| P-COV.2 hooks | 7-8h |
| P-COV.3 contexts | 1h |
| P-COV.4 componentes | 55-60h |
| P-COV.5 pages | 15-16h |
| P-COV.6 App.tsx | 2h |
| P-COV.7 edge functions | 27h |
| **TOTAL** | **~130-140 horas** (~3-4 semanas dedicadas) |

### Faseamento sugerido (chegar a 100% sem morrer no meio)

**Fase A — Threshold 50% (1 sprint, ~25h)**
- P-COV.0 + P-COV.1 + P-COV.2 + P-COV.3.
- Resultado: cobertura ~55-60%.
- Lock no CI: threshold passa a 50%.

**Fase B — Threshold 75% (2 sprints, ~30h)**
- P-COV.5 (pages) + metade de P-COV.4 (forms + common + chat).
- Resultado: cobertura ~75%.
- Lock no CI: threshold passa a 75%.

**Fase C — Threshold 90% (2 sprints, ~30h)**
- Restante de P-COV.4 (editor + dialogs + adaptation steps) + P-COV.6.
- Resultado: cobertura ~90%.
- Lock no CI: threshold passa a 90%.

**Fase D — 100% (1 sprint, ~30h)**
- P-COV.7 (edge functions Deno).
- Polimento de branches residuais com `/* v8 ignore */` justificados.
- Lock no CI: threshold passa a 100% (statements/lines/functions; branches em 95% por causa de `?.` chains).

### Critérios de qualidade (não relaxar para inflar coverage)

- ❌ **Proibido**: testes que renderizam o componente e só checam `toBeInTheDocument()`.
- ❌ **Proibido**: usar `vi.mock` pra silenciar lógica não testada.
- ✅ **Obrigatório**: cada teste valida comportamento (input → output ou interação → efeito).
- ✅ **Obrigatório**: incluir caso de erro/edge para cada função pública.
- ✅ **Obrigatório**: branches `||`, `??`, `?:` cobertas explicitamente.
- ✅ **Obrigatório**: `/* v8 ignore next */` precisa de comentário explicando *porque* aquela linha é inalcançável em jsdom.

---

## P3 — Higiene de dependências e segurança

### P3.1 — Remover componentes shadcn/ui não usados (ALTO impacto, BAIXO risco)

**25 componentes** em `src/components/ui/` instalados mas **nunca importados** (verificado via grep cross-source):

```
accordion, aspect-ratio, avatar, breadcrumb, calendar, carousel,
collapsible, command, context-menu, drawer, form, hover-card,
input-otp, menubar, navigation-menu, pagination, popover, progress,
radio-group, sidebar, slider, table, tabs, toaster, toggle-group
```

**Ação**:
1. Remover os 25 arquivos `.tsx` em [src/components/ui/](src/components/ui/).
2. Remover dependências `@radix-ui/*` correspondentes do [package.json](package.json):
   - `@radix-ui/react-accordion`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-slider`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle-group`.
   - Manter as que aparecem indiretamente em outros componentes shadcn (ex.: `@radix-ui/react-slot` é usado por `button`).
3. Remover libs satélites se ficarem órfãs: `cmdk` (command), `embla-carousel-react` (carousel), `vaul` (drawer), `input-otp`, `react-day-picker` (calendar).
4. Validar com `npx depcheck` antes/depois.

**Critério de aceitação**:
- `npm run lint && npm run typecheck && npm run test` continua verde.
- `make build` continua verde (Vite + Vercel build).
- `dist/` shrinka (medir bundle size antes/depois).

**Cuidado**:
- Não tocar em componentes shadcn em uso indireto (ex.: `card`, `dialog`, `select`, `dropdown-menu`, `button`, `input`, `label`, `textarea`, `badge`, `alert`, `alert-dialog`, `checkbox`, `scroll-area`, `separator`, `sheet`, `skeleton`, `sonner`, `switch`, `tooltip`, `toast`, `toggle`, `resizable`).

---

### P3.2 — Restringir CORS de mutações sensíveis

Arquivos com `Access-Control-Allow-Origin: *`:

| Function | Risco | Ação |
|---|---|---|
| [supabase/functions/create-checkout/index.ts:5](supabase/functions/create-checkout/index.ts#L5) | **ALTO** — cria pagamento | Restringir para origem da app via env var |
| [supabase/functions/extract-questions/index.ts:8](supabase/functions/extract-questions/index.ts#L8) | MÉDIO — consome créditos | Restringir |
| [supabase/functions/regenerate-question/index.ts:8](supabase/functions/regenerate-question/index.ts#L8) | MÉDIO — consome créditos | Restringir |
| [supabase/functions/chat/index.ts:7](supabase/functions/chat/index.ts#L7) | MÉDIO — consome créditos | Restringir |
| [supabase/functions/adapt-activity/index.ts:8](supabase/functions/adapt-activity/index.ts#L8) | MÉDIO — consome créditos | Restringir |
| [supabase/functions/check-and-deduct-credits/index.ts:5](supabase/functions/check-and-deduct-credits/index.ts#L5) | MÉDIO | Restringir |
| [supabase/functions/mp-webhook/index.ts:5](supabase/functions/mp-webhook/index.ts#L5) | OK manter `*` — webhook do Mercado Pago vem de origem externa não controlada | Manter `*`, mas validar assinatura HMAC (já feito em [mp-webhook/index.ts:74](supabase/functions/mp-webhook/index.ts#L74)) |

**Implementação sugerida**:
1. Criar utilitário em `supabase/functions/_shared/cors.ts`:
   ```ts
   export function buildCorsHeaders(req: Request) {
     const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "*";
     const origin = req.headers.get("origin") ?? "";
     return {
       "Access-Control-Allow-Origin": allowedOrigin === "*" ? "*" : (origin === allowedOrigin ? origin : ""),
       "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
       "Access-Control-Allow-Methods": "POST, OPTIONS",
     };
   }
   ```
2. Adicionar `APP_ORIGIN=https://app.orientadordigital.com` ao Supabase secrets de prod.
3. Refatorar 6 functions para consumir `buildCorsHeaders(req)` em vez de objeto estático.
4. Manter `mp-webhook` com `*` (intencional).

**Critério de aceitação**:
- E2E manual: app no domínio de prod consegue chamar todas as functions; chamadas do `localhost:8080` durante dev funcionam (configurar `APP_ORIGIN=*` no env local, ou listar múltiplas origens).
- Função `mp-webhook` continua aceitando POST do Mercado Pago.

---

### P3.3 — Endurecer `tsconfig`

Arquivos:
- [tsconfig.app.json](tsconfig.app.json): `noImplicitAny: false`, `noUnusedLocals: false`, `strict: false`
- [tsconfig.json](tsconfig.json): `noImplicitAny: false`, `noUnusedLocals: false`, `strictNullChecks: false`

**Faseamento** (tudo de uma vez = inviável, vai estourar erros):

**Fase 3.3.a** — habilitar `noUnusedLocals: true` e `noUnusedParameters: true`
- Captura imports/locais mortos no CI.
- Risco: dezenas de erros tipo "is declared but never read" em código legado. Triagem: deletar código realmente morto, prefixar com `_` quando intencional.
- Estimativa: 2-4 horas.

**Fase 3.3.b** — habilitar `strictNullChecks: true`
- Captura `undefined`/`null` não tratados.
- Risco: ALTO. Centenas de erros prováveis em código que confia em `?.` mal posicionado.
- Estratégia: começar por arquivos novos/críticos via `// @ts-strict` e expandir; ou aceitar refator amplo em sprint dedicado.
- Estimativa: 1-2 sprints.

**Fase 3.3.c** — `strict: true` completo
- Inclui `noImplicitAny`, `strictFunctionTypes`, etc.
- Só após 3.3.b consolidar.

**Critério de aceitação por fase**:
- `npm run typecheck` verde.
- Suíte de testes continua verde.

---

### P3.4 — Adicionar testes para edge functions Deno

Atualmente: **0 testes** em `supabase/functions/`.

**Alvo prioritário**: utilitários compartilhados em [supabase/functions/_shared/](supabase/functions/_shared/) (são puros, fácil de cobrir):

- `_shared/sanitize.ts` — sanitização de input
- `_shared/aiConfig.ts` — config do provider de IA
- `_shared/logAiUsage.ts` — log de uso (mockando Supabase client)

**Stack**:
- Usar `deno test` nativo com `@std/testing` e mocks de fetch/Supabase.
- Comando: `cd supabase/functions && deno test --allow-env --allow-net=localhost _shared/`.

**Estimativa**: 4-6 horas (3 utilitários × 2-3 testes cada).

**Critério de aceitação**:
- Adicionar step ao `.github/workflows/supabase.yml` rodando `deno test` nos arquivos de `_shared/`.

---

## P4 — Polimento

### P4.1 — Resolver warning legado de lint

[src/components/dialogs/ImageCropperModal.tsx:95](src/components/dialogs/ImageCropperModal.tsx#L95) — `useCallback` sem dep `getCropRect`.

**Ação**: investigar com [pdf-debugger]/[hook-writer] (área frágil, conforme tag CLAUDE.md). Decidir entre:
- Adicionar `getCropRect` às deps (pode causar re-renders extras se função não for estável).
- Mover `getCropRect` para fora do componente ou wrapping com `useCallback`.
- Suprimir com `// eslint-disable-next-line` + comentário explicando porque é estável.

---

### P4.2 — Migrar restante das suítes para `helpers.ts`

Hoje só **5 de 34** suites usam `src/test/helpers.ts`. As outras 29 ainda repetem mock setup inline.

**Alvo de migração** (baixo esforço, alto valor de manutenção):
- `src/hooks/useCredits.test.ts` — usa wrapper local de QueryClient
- `src/hooks/useQuestionBank.test.ts` — idem
- `src/hooks/useRegenerateQuestion.test.ts` — mock manual de `import.meta`
- `src/hooks/useSendMessage.test.ts` — idem
- `src/hooks/useBarrierProfiles.test.ts` — idem
- `src/contexts/AuthContext.test.tsx` — mock inline complexo
- `src/components/chat/ChatSidebar.test.tsx`, `ChatWindow.test.tsx`
- `src/components/adaptation/**/*.test.tsx` (4 arquivos)
- `src/pages/BarrierProfilesPage.test.tsx`, `CreditsPage.test.tsx`, `QuestionBankPage.test.tsx`

**Estratégia**: migrar 1-2 por commit com `replace queryWrapper` e `buildAuthState`. Não fazer tudo de uma vez.

---

### P4.3 — Coverage threshold no CI

[vitest.config.ts](vitest.config.ts) tem coverage configurado (60%) mas é informativo, não falha o CI.

**Ação**:
1. Habilitar `--coverage` em `package.json:scripts.test`.
2. Adicionar threshold mínimo realista (40% statements como baseline atual, depois 60%).
3. Quebrar CI se cair abaixo.

---

### P4.4 — Documentação leve para onboarding de testes

Criar `src/test/README.md` (curto, ~50 linhas) com:
- Como usar `renderWithProviders`, `queryWrapper`, `buildAuthState`.
- Padrão de mock de Supabase: `vi.mock("@/integrations/supabase/client", ...)` com `createQueryChain`.
- Exemplo de teste de hook + de componente.

OU criar `src/test/template.test.ts` como referência viva.

---

### P4.5 — Auditoria de imports relativos

Buscar imports `../../*` que deveriam ser `@/*`:

```bash
grep -rn "from \"\.\./\.\./" src/ --include="*.ts" --include="*.tsx"
```

Hoje a regra está sendo seguida, mas não há lint rule. Adicionar em `eslint.config.js`:

```js
"no-restricted-imports": ["error", {
  patterns: [{ group: ["../../*"], message: "Use o alias @/ para imports cross-folder." }]
}]
```

---

## Itens descobertos durante a execução (não estavam no plano original)

### D1 — Componentes potencialmente órfãos (verificar antes de deletar)

Não importados em lugar algum do projeto:

- [src/components/common/CreditBalance.tsx](src/components/common/CreditBalance.tsx) — `CreditBalance` (com teste co-localizado, mas nenhum consumidor)
- [src/components/dialogs/FilePreviewModal.tsx](src/components/dialogs/FilePreviewModal.tsx) — `FilePreviewModal`
- [src/components/dialogs/ImageCropperModal.tsx](src/components/dialogs/ImageCropperModal.tsx) — `ImageCropperModal`

**Ação**: confirmar com Alexandre se são WIP ou morto. Se morto, deletar (e tests). Se WIP, deixar nota inline.

### D2 — Volume `app_node_modules` Docker desincroniza facilmente

Durante a sessão, o volume montado no container ficou desatualizado em relação ao `package.json` (faltavam `@vitejs/plugin-react` e `katex`). Foi necessário rodar `npm install` dentro do container pra sincronizar.

**Ação**: documentar em [README.md](README.md) ou [CLAUDE.md](CLAUDE.md) que após mudança em `package.json`:
```bash
make rebuild  # OU
docker compose run --rm --no-deps app npm install
```

### D3 — Hook Stop falha quando container está down

[.claude/hooks/test-suite.sh](.claude/hooks/test-suite.sh) faz fallback para o **host** quando container não está rodando, mas o host não tem `node_modules` sincronizado por padrão.

**Opções**:
- **A**: Manter `node_modules` instalado no host (conflita com filosofia "tudo no container").
- **B**: Modificar o hook para tentar `docker compose run --rm --no-deps app` se `ps` retornar vazio.
- **C**: Aceitar e documentar: "rode `make up` antes de finalizar o turno".

### D4 — Edge function `chat` é chamada via fetch direto, não `supabase.functions.invoke`

[src/hooks/useSendMessage.ts:21](src/hooks/useSendMessage.ts#L21) usa `fetch` direto. As outras seguem o mesmo padrão. Inconsistência: [src/hooks/useCredits.ts:36](src/hooks/useCredits.ts#L36) usa `supabase.functions.invoke()`.

**Decisão pendente**: padronizar em um dos dois. `invoke` é menos verboso e abstrai auth, mas perde streaming SSE — que é por que `chat` usa `fetch`. Decidir caso-a-caso por capability.

---

## Ordem sugerida de execução

| Sprint | Itens | Esforço | Prioridade |
|---|---|---|---|
| 1 (commits) | Pré-req: commits dos 78 arquivos | 30min | URGENTE |
| 1 | P3.1 Remover shadcn não usados | 2h | ALTA |
| 1 | P3.2 CORS endurecido | 2h | ALTA (segurança) |
| 2 | P3.3.a `noUnusedLocals` | 2-4h | MÉDIA |
| 2 | P4.1 Warning lint legado | 1h | BAIXA |
| 2 | D1 Confirmar/limpar órfãos | 30min | MÉDIA |
| 3 | P3.4 Testes edge functions | 4-6h | MÉDIA |
| 3 | P4.2 Migrar suites para helpers | 3-4h | BAIXA |
| 4 | P3.3.b `strictNullChecks` | 1-2 sprints | ALTA (qualidade) |
| - | P4.3, P4.4, P4.5 | 1h cada | BAIXA |

---

## Critério de "pronto" geral

Cada item acima só é considerado concluído quando:

1. `make lint && make typecheck && make test` passam dentro do container.
2. `make build` produz `dist/` sem erro.
3. CI (`.github/workflows/deploy.yml`) passa em PR.
4. Funcionalidades testadas manualmente seguindo CLAUDE.md "Modo de discussão" para mudanças de UI.
