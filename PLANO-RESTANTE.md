# Plano restante — Orientador Digital B2C

> **Última atualização**: 2026-04-28
>
> **Estado atual** (validado):
> - 76 suites / 757 testes verdes, lint 0 erros + 1 warning legado, typecheck OK.
> - **Coverage atual: ~87.6%** (statements 87.6%, branches 82.81%, functions 85.57%, lines 89.37%).
> - **Meta declarada pelo usuário: 100% de coverage. Tudo testado.**
> - Working tree limpa — todos os commits de P0+P1+P2 já aplicados.

---

## Histórico — O que já foi feito

| Fase | Descrição | Status |
|---|---|---|
| P0.1 | Helpers de teste (`src/test/helpers.ts`, `setup.ts`) | ✅ |
| P0.2 | Deduplicação de `QuestionType` e `SUBJECTS` | ✅ |
| P0.3 | Testes endurecidos (de superficiais para comportamentais) | ✅ |
| P1.1 | Cobertura crítica de 10+ módulos sem cobertura | ✅ |
| P1.2 + P1.3 | Refactor de testes superficiais | ✅ |
| P2.1 | Reorganização de `components/` em `forms/dialogs/common/editor` | ✅ |
| P2.2 | Reorganização de `lib/` em `domain/utils/` | ✅ |
| P-COV (parcial) | Suite completa — 76 arquivos, 757 testes — coverage 87.6% | ✅ |

---

## Pendentes

### P3.1 — Remover componentes shadcn/ui não usados ⬅ PRÓXIMO

28 arquivos em `src/components/ui/` instalados mas **nunca importados** fora de `ui/`:

```
accordion, aspect-ratio, avatar, breadcrumb, calendar, carousel,
collapsible, command, context-menu, drawer, form, hover-card,
input-otp, menubar, navigation-menu, pagination, popover, progress,
radio-group, sidebar, slider, table, tabs, toast, toaster,
toggle, toggle-group, use-toast
```

Radix packages a remover:
- `@radix-ui/react-accordion`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`
- `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-hover-card`
- `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`
- `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-slider`
- `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`
- `@radix-ui/react-toggle-group`

Satellite libs a remover: `cmdk`, `embla-carousel-react`, `vaul`, `input-otp`, `react-day-picker`

**Critério**: lint + typecheck + test + build verdes.

---

### ~~P3.2 — CORS~~ — PULADO (decisão do usuário)

---

### D1 — Componentes órfãos — confirmar e limpar

Não importados em lugar algum do projeto:

- `src/components/dialogs/FilePreviewModal.tsx`
- `src/components/dialogs/ImageCropperModal.tsx`
- `src/components/common/CreditBalance.tsx` — tem teste co-localizado, mas nenhum consumidor

**Ação**: remover se confirmado WIP morto.

---

### P3.3.a — `noUnusedLocals: true` no tsconfig

Habilitar em `tsconfig.app.json` e `tsconfig.json`. Vai capturar imports/locais mortos no CI.

**Risco**: dezenas de erros em código legado — triagem: deletar código morto, prefixar `_` quando intencional.
**Estimativa**: 2-4h.

---

### P3.3.b — `strictNullChecks: true` (sprint dedicado)

Somente após 3.3.a consolidar.
**Risco**: ALTO. Centenas de erros prováveis.

---

### P3.4 — Testes edge functions Deno

10 arquivos em `supabase/functions/`. Hoje 0% — Vitest não roda Deno.
Usar `deno test --coverage` nativo.
Prioridade: `_shared/` (3 arquivos puros, 4-6h).

---

### P4.1 — Resolver warning legado de lint

`src/components/dialogs/ImageCropperModal.tsx:95` — `useCallback` sem dep `getCropRect`.

---

### P4.2 — Migrar suítes para `helpers.ts`

29 de 76 suítes ainda repetem mock setup inline. Migrar gradualmente (1-2 por commit).

---

### P4.3 — Coverage threshold no CI

`vitest.config.ts` tem threshold informativo (60%). Habilitar como gate real no CI.

---

### P4.5 — Lint rule para imports relativos

```js
"no-restricted-imports": ["error", {
  patterns: [{ group: ["../../*"], message: "Use o alias @/ para imports cross-folder." }]
}]
```

---

### P-COV — Gaps de coverage restantes

| Área | Atual | Alvo |
|---|---|---|
| `components/dialogs` | 66% stmts / 65% branches | 100% |
| `components/forms` | 74% stmts | 100% |
| `QuestionBankPage` | 70% stmts | 100% |
| `adaptation/AdaptationWizard` | 82% | 100% |
| `adaptation/steps/ai-editor` | 84% | 100% |
| Edge functions Deno | 0% | 100% (via deno test) |

---

## Ordem de execução sugerida

| # | Item | Esforço | Prioridade |
|---|---|---|---|
| 1 | P3.1 Remover shadcn não usados | 1-2h | ALTA |
| 2 | D1 Limpar órfãos | 30min | MÉDIA |
| 3 | P3.3.a noUnusedLocals | 2-4h | MÉDIA |
| 4 | P4.1 Warning lint | 30min | BAIXA |
| 5 | P4.3 Threshold CI | 30min | MÉDIA |
| 6 | P4.5 Lint rule imports | 15min | BAIXA |
| 7 | P-COV dialogs + forms + pages | 10-15h | ALTA |
| 8 | P3.4 Edge functions Deno | 4-6h | MÉDIA |
| 9 | P3.3.b strictNullChecks | 1-2 sprints | ALTA (qualidade) |
| 10 | P4.2 Migrar suítes helpers | 3-4h | BAIXA |

---

## Critério de "pronto" geral

1. `make lint && make typecheck && make test` passam dentro do container.
2. `make build` produz `dist/` sem erro.
3. CI (`.github/workflows/deploy.yml`) passa em PR.
4. Funcionalidades testadas manualmente para mudanças de UI.
