# Melhoria de tratamento de erros + remoção do gateway Lovable

**Data:** 2026-06-01
**Branch:** `feat/tdd-100-cobertura-creditos`

## Objetivo

Limpar o tratamento de erros da aplicação, que está genérico e carrega resquícios
do scaffolding original da Lovable que não fazem mais sentido. Três frentes:

1. Remover por completo o gateway de IA da Lovable, padronizando no Google AI.
2. Parar de vazar `err.message` cru nos toasts.
3. Adicionar um Error Boundary (hoje um erro de render derruba o app inteiro).

Fora de escopo (não selecionado pelo usuário): padronizar respostas internas das
edge functions e reescrever mensagens "muito genéricas". A única edge function
tocada é a de config de IA (`_shared/aiConfig.ts`), pela remoção da Lovable.

## Parte A — Remover o gateway Lovable

Estado atual: `_shared/aiConfig.ts` usa `LOVABLE_API_KEY` como provedor **primário**
(precedência sobre o Google). `AiConfig.isLovable` e `resolveImagePayloadFields`
existem só por causa disso e **não são consumidos por nenhuma edge function**
(código órfão, confirmado por grep).

Mudanças:

- `aiConfig.ts`: remover o campo `isLovable` da interface `AiConfig`; remover o ramo
  `lovableKey`; Google (`AI_API_KEY`) vira o único provedor. `resolveModel` sempre
  usa o `MODEL_MAP`.
- Deletar `resolveImagePayloadFields` (código morto que só ramificava por Lovable).
- Mensagem do erro "no provider configured" passa a citar só `AI_API_KEY`.
- `aiConfig.test.ts`: remover testes de Lovable/precedência/modalities; manter os do
  Google; ajustar o teste do EnvGetter default para `AI_API_KEY`.
- Remover `LOVABLE_API_KEY` de `.env.example` (e do `.env` local, não versionado).

**Risco operacional:** após a remoção, as functions em produção lançam
"No AI provider configured" se o secret `AI_API_KEY` não estiver setado no Supabase
remoto. Confirmar que o Google AI já é o provedor ativo antes do deploy.

## Parte B — Parar de vazar `err.message` cru nos toasts

Estratégia: reusar os parsers já testados de `src/lib/utils/errors.ts`, aplicando o
correto por contexto. Nada de `e instanceof Error ? e.message : "..."`.

- `parseDbError(err, fallback)` → DB/storage (nunca vaza; cai no fallback).
- `parseEdgeFnError(err, fallback)` → erros vindos do backend (mensagens já em pt-BR).

Pontos a corrigir:

- `QuestionBankPage.tsx` linhas 236, 330, 461, 483 → parser conforme a origem
  (upload, extração, exclusão, storage).
- `QuestionRegeneratePanel.tsx:77` → `parseEdgeFnError`.
- `useCredits.ts:49,70` e `useAdminDashboard.ts:39` → envolver `onError` com
  `parseEdgeFnError` (hoje "seguro mas frágil"; fica consistente e à prova de erro
  inesperado).

## Parte C — Error Boundary

- `src/components/common/ErrorBoundary.tsx`: class component com
  `getDerivedStateFromError` (seta estado de erro) e `componentDidCatch` (loga no
  console). Suporta reset do estado.
- `src/components/common/ErrorFallback.tsx`: UI amigável em pt-BR, botão "Recarregar
  página" (`window.location.reload`) e "Tentar novamente" (reseta o boundary).
- Montar em `App.tsx` envolvendo `<Routes>`, dentro do `AuthProvider` e fora do
  `<Toaster>` (o toast sobrevive ao erro de render).
- Sem dependência nova (`react-error-boundary` não é necessário).

## Testes / cobertura

Mantém o gate de 100% em `vitest.config.ts`.

- Parte A: Vitest (`aiConfig.test.ts`) — Red primeiro, depois Green.
- Parte B: cobertura já existente nos componentes/hooks; ajustar/adicionar casos de
  erro onde a troca de parser muda o branch.
- Parte C: Testing Library — renderiza filhos normalmente; renderiza fallback quando
  filho lança; botão de reset re-renderiza; botão de reload chama `window.location.reload`.

## Ordem

A (Lovable) → B (toasts) → C (boundary). Cada parte em ciclo Red → Green → Refactor.
Commit só após validação manual e confirmação explícita do usuário (regra do projeto).
