# Estratégia de Testes em Camadas

O alvo é **100% de cobertura da lógica de negócio, sempre automatizado**. Cada camada tem
sua ferramenta — escolha a certa para o que está testando.

| Camada | Ferramenta | Cobre | Comando |
| ------ | --------- | ----- | ------- |
| Lógica/unit (hooks, `lib/domain`, `_shared`) | **Vitest** | cálculo de custo, parsers, orquestração das functions extraída para `_shared/` | `make test` / `npm run test:coverage` |
| Banco / RPC / RLS (`deduct_credits`, `grant_credits`, policies) | **pgTAP** | lock, saldo insuficiente, free-first, segurança RLS | `make test-db` (`supabase test db`) |

## Regras

- **Gate de cobertura 100%** travado em `vitest.config.ts` (statements/branches/functions/lines)
  — o CI quebra se cair. Mantenha-o em 100%; nunca baixe o threshold para "passar".
- **Exclusões legítimas da cobertura** (código gerado/vendado, sem valor testar):
  `src/integrations/supabase/types.ts`, `src/components/ui/**`, e os
  `supabase/functions/**/index.ts` (glue HTTP). **Lógica de verdade não vai em `index.ts`**
  — extraia para `supabase/functions/_shared/` para que seja coberta pelo Vitest.
- **Lógica sensível a dinheiro/segurança** (RPCs de crédito, RLS) é coberta por **pgTAP**,
  não por mock — mockar o client não testaria o lock nem as policies reais. Os testes ficam
  em `supabase/tests/database/*.test.sql`.
- **Enforcement local**: Husky + lint-staged. `pre-commit` roda lint + testes afetados nos
  arquivos staged; `pre-push` roda `typecheck` + suíte Vitest. (`test-db` exige Docker; roda no CI.)

## Convenções de teste

- Testes **colocados ao lado do arquivo** (`useFoo.test.ts` ao lado de `useFoo.ts`).
  `src/test/` guarda só infra global: `setup.ts` (matchMedia, ResizeObserver) e
  `helpers.ts` (`renderWithProviders()`, `queryWrapper()`, `buildAuthState()`,
  `createQueryChain()`, `flushPromises()`). **Não há `fixtures.ts`** — fixture inline no teste.

## Memória e Performance

- Testes: `NODE_OPTIONS='--max-old-space-size=19456'`
- Vitest usa fork pool (max 4 workers)

## CI/CD

`.github/workflows/deploy.yml`: Lint → Test (Vitest com `npm run test:coverage`, **gate de
100% quebra o build**) → Build, instalando deps com `npm ci`. Um job `db-tests` sobe Supabase
local (`supabase db start`) e roda os testes pgTAP (`supabase test db`). Deploy pelo Vercel via
integração GitHub. `supabase.yml` deploya migrations/functions/types ao push em `supabase/**`.
