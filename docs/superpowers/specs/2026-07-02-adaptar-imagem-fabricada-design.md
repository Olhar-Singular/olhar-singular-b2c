# Design — Imagem fabricada pela IA no Adaptar

**Data:** 2026-07-02
**Área:** `adapt-activity` (edge function) + prompt do Gemini + `_shared`
**Status:** desenho aprovado, aguardando revisão do spec

## Problema

A edge function `adapt-activity` gera blocos de imagem com **URLs externas
fabricadas** pela IA (ex.: `https://i.ibb.co/6gBw2Rj/2-bolas-azuis.png`). Na tela
elas morrem em CORS (console cheio de erro); no PDF saem como buraco (o `<Image>`
do react-pdf não carrega). Validação real do fluxo, 2026-07-02.

## Causa-raiz

O input pro Gemini é **texto puro** — o modelo nunca "vê" imagem. Questões do banco
que têm `image_url` são achatadas em texto com um marcador `[IMAGEM: <url>]` por
[buildActivityText.ts:19](../../../src/components/adaptation/steps/activity-input/buildActivityText.ts).
Atividades coladas manualmente não têm imagem nenhuma.

O system prompt ensina a **montar** um bloco `image` e a **converter** o marcador
`[IMAGEM: <url>]`, mas em lugar nenhum:
- proíbe inventar imagens, nem
- restringe o `src` a URLs vindas de um marcador.

Ver [adaptationPrompt.ts:247-248](../../../supabase/functions/_shared/adaptationPrompt.ts).
Logo, quando o modelo julga que uma figura ajudaria, ele fabrica um `src` plausível
e o output passa em toda a validação.

A única validação de URL hoje é `isSafeImageSrc`
([schema.ts:32-39](../../../src/lib/adaptation/canonical/schema.ts)) — **allowlist de
protocolo só** (`https:`/`http:`/`data:image`). Uma URL `https://` fabricada passa
limpa. Esse arquivo é **compartilhado com o Deno** (roda no browser em cada
edição/render/autosave), então apertá-lo teria blast radius grande: rejeitaria docs
legados na leitura e travaria inserção manual de imagem no editor. **Não é o lugar.**

O único sinal confiável de "imagem legítima" são os marcadores `[IMAGEM: <url>]` do
input — reais, disponíveis no edge, e hoje **nunca cruzados** com o `src` emitido.

## Decisão

Tratar em **duas camadas** (aprovado): prompt reduz a ocorrência na origem; um filtro
determinístico no edge é a **garantia** de que nenhuma URL fabricada sobrevive.
Imagem fabricada vira **nota de texto** (o `alt` no fluxo, sem chrome de imagem).

Nenhuma mudança em `isSafeImageSrc`/schema — o filtro é edge-only, **zero blast
radius no browser**.

## Camada 1 — Prompt (edge-only)

Reescrever as instruções de imagem em
[adaptationPrompt.ts:247-248](../../../supabase/functions/_shared/adaptationPrompt.ts)
para deixar explícito:

- **Nunca** inventar imagens nem URLs.
- Só emitir bloco `image` quando o input contiver um marcador `[IMAGEM: <url>]`, com
  `src` **idêntico** à `<url>` do marcador (mantém a regra atual de substituir o
  marcador literal pelo bloco).
- Se uma figura ajudaria e **não** há original, **descrever em texto** — nunca forjar
  uma imagem.

Efeito: menos imagens forjadas chegando ao filtro (menos texto de substituição), e o
modelo passa a colocar a descrição no lugar certo (texto) por conta própria.

## Camada 2 — Filtro determinístico (a garantia)

Ponto de interceptação: `interpretAiResponse` em
[adaptActivityCore.ts:87-108](../../../supabase/functions/_shared/adaptActivityCore.ts),
depois do parse (`parseAiActivity` → `buildAdaptationResult` → `normalizeAiActivity` →
`validateDocument`) e **antes** de retornar ao client. Lembrar: o edge **não
persiste** — retorna o documento ([index.ts:267-277](../../../supabase/functions/adapt-activity/index.ts))
e o browser autosava. Filtrar aqui é suficiente.

Algoritmo:

1. **Extrair a allowlist** de URLs a partir dos marcadores `[IMAGEM: <url>]` do
   `original_activity` (regex; helper novo em `_shared`, ex.: `extractImageMarkers.ts`,
   testável). Normalizar (trim) antes de comparar.
2. **Percorrer o documento** parseado — blocos top-level **e** blocos dentro do
   `stem` das questões (é onde `normalizeContentBlock` cria imagens,
   [ai.ts:245-254](../../../src/lib/adaptation/canonical/ai.ts)).
3. Para todo bloco `image` cujo `src` **∉ allowlist** → **substituir por um bloco
   `paragraph`** cujo texto é o `alt` da imagem (decisão "nota de texto": `alt` cru,
   **sem** prefixo — some o conceito de imagem, a descrição continua legível). Se o
   `alt` for vazio, remover o bloco.
4. Manual-paste → allowlist vazia → toda imagem vira texto (correto: não há original).

O documento resultante precisa continuar válido no schema (parágrafo com RichText é
sempre válido). O helper de filtro é lógica pura em `_shared` → **Vitest**.

## Suposição a confirmar na implementação

Que `original_activity` chega ao edge **com** os marcadores `[IMAGEM: <url>]` (é o
output de `buildActivityText`, e o edge só faz `sanitize()` sobre ele —
[index.ts:145](../../../supabase/functions/adapt-activity/index.ts)). Se `sanitize()`
comer os colchetes/URL, ou se o texto chegar por outro caminho, a allowlist tem que
vir de outra fonte (ex.: um campo estruturado no request). **Verificar antes de
codar.**

## Estratégia de testes

| Camada | Ferramenta | Cobre |
| ------ | --------- | ----- |
| Extração de marcadores | Vitest | regex, múltiplos marcadores, trim, ausência |
| Filtro do documento | Vitest | image válida preservada; fabricada → parágrafo com `alt`; `alt` vazio → removida; imagem em `stem`; manual-paste tira tudo; doc resultante valida |
| Prompt | — (não unit) | **validate-adaptar** com Gemini real: gerar uma atividade que tentaria imagem e confirmar que não sobra URL externa quebrada |

Gate de cobertura 100% (Vitest) mantido — filtro e extrator são lógica pura, sem mock.
Antes de fechar: skill **validate-adaptar** (bundle Deno + IA real + persistência).

## Fora de escopo

- Multimodal real (mandar bytes de imagem pro Gemini).
- Allowlist de domínio / verificação de reachability em `isSafeImageSrc` (blast radius
  no browser; não resolve o problema real, que é a fabricação).
- Geração de imagens pela IA.

## Doc viva

Mudança de contrato no fluxo Adaptar (edge passa a filtrar imagens) → atualizar a
skill `dominio-orientador` (gotcha de dados / comportamento do `adapt-activity`) e, se
tocar o entendimento do canônico, a skill `validate-adaptar`, **na mesma tarefa**.
