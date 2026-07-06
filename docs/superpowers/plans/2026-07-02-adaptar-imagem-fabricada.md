# Imagem fabricada pela IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que o `adapt-activity` retorne blocos de imagem com URLs fabricadas pela IA — endurecendo o prompt e filtrando deterministicamente no edge, com imagem inválida virando nota de texto.

**Architecture:** Duas camadas. (1) Prompt (`_shared/adaptationPrompt.ts`) proíbe inventar imagens e restringe `src` a marcadores `[IMAGEM: url]`. (2) Um guard novo em `_shared/imageSourceGuard.ts` extrai a allowlist de URLs dos marcadores do texto (o mesmo que a IA viu) e substitui todo bloco `image` cujo `src` não está na allowlist por um parágrafo com o `alt`. O guard roda no glue `index.ts` sobre o `AdaptationResult` já normalizado, antes de retornar ao client. Nada toca `isSafeImageSrc`/schema (compartilhado com o browser).

**Tech Stack:** Deno edge function + TypeScript; Zod (canônico compartilhado); Vitest (gate 100%); skill `validate-adaptar` (bundle Deno + Gemini real).

## Global Constraints

- **TDD obrigatório**: Red → Green → Refactor. Nunca editar código sem teste que cubra a mudança.
- **Gate de cobertura 100%** (statements/branches/functions/lines) em `vitest.config.ts` — `supabase/functions/_shared/**` está incluído; todo branch novo precisa de teste. `index.ts` é **excluído** (glue HTTP) — não recebe teste unitário.
- **Nunca commit automático.** Preparar o commit e **aguardar aprovação explícita** do usuário após teste manual. O executor NÃO commita sozinho.
- **Rodar em container**: node_modules vive no container. Testes/lint/typecheck via `make` ou `docker compose exec app ...` (o hook de lint do host quebra). Garanta o container up (`make start`) antes de rodar.
- **Import Deno**: arquivos em `_shared/` que importam o canônico usam caminho relativo com **extensão `.ts` explícita** (ex.: `../../../src/lib/adaptation/canonical/schema.ts`). Só `import type` do schema — nunca acoplar runtime a `isSafeImageSrc`.
- **Idioma**: UI/prompt em pt-BR; código e comentários em inglês.

---

### Task 1: `extractImageMarkers` + normalização de URL

**Files:**
- Create: `supabase/functions/_shared/imageSourceGuard.ts`
- Test: `supabase/functions/_shared/imageSourceGuard.test.ts`

**Interfaces:**
- Produces: `extractImageMarkers(text: string): Set<string>` — conjunto de URLs (normalizadas) dos marcadores `[IMAGEM: <url>]` no texto. Normalização = HTML-unescape das 5 entidades do `sanitize()` (`&amp; &lt; &gt; &quot; &#39;`) + `trim()`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/imageSourceGuard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractImageMarkers } from "./imageSourceGuard";

describe("extractImageMarkers", () => {
  it("extracts a single marker URL", () => {
    const set = extractImageMarkers("Questão 1\n[IMAGEM: https://x.co/a.png]");
    expect([...set]).toEqual(["https://x.co/a.png"]);
  });

  it("extracts multiple marker URLs", () => {
    const set = extractImageMarkers("[IMAGEM: https://x.co/a.png]\n[IMAGEM: https://x.co/b.png]");
    expect(set.has("https://x.co/a.png")).toBe(true);
    expect(set.has("https://x.co/b.png")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("returns an empty set when there are no markers", () => {
    expect(extractImageMarkers("nenhuma imagem aqui").size).toBe(0);
  });

  it("trims whitespace inside the marker", () => {
    const set = extractImageMarkers("[IMAGEM:   https://x.co/a.png   ]");
    expect([...set]).toEqual(["https://x.co/a.png"]);
  });

  it("HTML-unescapes an escaped '&' so it matches the raw URL", () => {
    // sanitize() turns `&` into `&amp;`; the allowlist must hold the decoded form.
    const set = extractImageMarkers("[IMAGEM: https://x.co/a.png?w=1&amp;h=2]");
    expect([...set]).toEqual(["https://x.co/a.png?w=1&h=2"]);
  });

  it("skips a marker whose URL is blank after trimming", () => {
    expect(extractImageMarkers("[IMAGEM:   ]").size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/imageSourceGuard.test.ts`
Expected: FAIL — `Failed to resolve import "./imageSourceGuard"` / `extractImageMarkers is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/imageSourceGuard.ts`:

```ts
// =============================================================================
// Edge-only guard against fabricated AI image URLs. The AI is text-only and
// sometimes invents image `src` values (dead CORS on screen, holes in the PDF).
// The only trustworthy image source is an [IMAGEM: <url>] marker in the input.
// This module (a) extracts the allowlist of marker URLs and (b) rewrites any
// image block whose src is not in it into a text paragraph (the alt as a note).
//
// Lives in _shared/ (edge-only, Vitest-covered). Imports the canonical types
// ONLY as types, with explicit .ts extension for Deno. Never touches the shared
// isSafeImageSrc/schema, so browser parsing/render is unaffected.
// =============================================================================

import type {
  AdaptationResult,
  Block,
  RichText,
} from "../../../src/lib/adaptation/canonical/schema.ts";

/**
 * HTML-unescape the five entities that `sanitize()` produces, then trim. Used to
 * compare marker URLs and image `src` on equal footing regardless of whether the
 * model copied the escaped (`&amp;`) or decoded (`&`) form. `&amp;` is decoded
 * last so `&amp;lt;` never collapses into `<`.
 */
function normalizeUrl(url: string): string {
  return url
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Extract the set of legitimate image URLs from `[IMAGEM: <url>]` markers in the
 * activity text. Pass the SAME (sanitized) text the model received.
 */
export function extractImageMarkers(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\[IMAGEM:\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const url = normalizeUrl(match[1]);
    if (url) out.add(url);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/imageSourceGuard.test.ts`
Expected: PASS (6 tests).

---

### Task 2: `stripFabricatedImages`

**Files:**
- Modify: `supabase/functions/_shared/imageSourceGuard.ts`
- Test: `supabase/functions/_shared/imageSourceGuard.test.ts`

**Interfaces:**
- Consumes: `extractImageMarkers` (Task 1); `normalizeUrl` (module-private).
- Produces: `stripFabricatedImages(result: AdaptationResult, allowedSrcs: Set<string>): AdaptationResult` — retorna um novo `AdaptationResult` em que todo bloco `image` (top-level ou dentro de `question.stem`) cujo `src` normalizado ∉ `allowedSrcs` vira um `paragraph` com `content = [{type:"text", text: alt.trim()}]` (ou `[]` se `alt` vazio), reusando o `id` e preservando `style` da imagem. Nunca remove blocos (mantém `blocks.min(1)` e stems).

- [ ] **Step 1: Write the failing test**

Append to `supabase/functions/_shared/imageSourceGuard.test.ts`:

```ts
import { stripFabricatedImages } from "./imageSourceGuard";
import type { AdaptationResult, Block } from "../../../src/lib/adaptation/canonical/schema";

const UID = {
  a: "11111111-1111-1111-1111-111111111111",
  b: "22222222-2222-2222-2222-222222222222",
  c: "33333333-3333-3333-3333-333333333333",
};

function resultWith(blocks: Block[]): AdaptationResult {
  return {
    schemaVersion: 1,
    document: { schemaVersion: 1, blocks },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

const imageBlock = (id: string, src: string, alt: string): Block =>
  ({ id, type: "image", src, alt }) as Block;

describe("stripFabricatedImages", () => {
  it("keeps an image whose src is in the allowlist", () => {
    const res = resultWith([imageBlock(UID.a, "https://x.co/a.png", "bola")]);
    const out = stripFabricatedImages(res, new Set(["https://x.co/a.png"]));
    expect(out.document.blocks[0]).toEqual(res.document.blocks[0]);
  });

  it("rewrites a fabricated image into a paragraph carrying the alt", () => {
    const res = resultWith([imageBlock(UID.a, "https://i.ibb.co/fake.png", "2 bolas azuis")]);
    const out = stripFabricatedImages(res, new Set());
    expect(out.document.blocks[0]).toEqual({
      id: UID.a,
      type: "paragraph",
      content: [{ type: "text", text: "2 bolas azuis" }],
    });
  });

  it("uses empty content when the fabricated image has a blank alt", () => {
    const res = resultWith([imageBlock(UID.a, "https://i.ibb.co/fake.png", "   ")]);
    const out = stripFabricatedImages(res, new Set());
    expect(out.document.blocks[0]).toEqual({ id: UID.a, type: "paragraph", content: [] });
  });

  it("preserves the image style on the replacement paragraph", () => {
    const styled = { ...imageBlock(UID.a, "https://i.ibb.co/fake.png", "x"), style: { align: "center" } } as Block;
    const out = stripFabricatedImages(resultWith([styled]), new Set());
    expect(out.document.blocks[0]).toEqual({
      id: UID.a,
      type: "paragraph",
      content: [{ type: "text", text: "x" }],
      style: { align: "center" },
    });
  });

  it("rewrites a fabricated image inside a question stem", () => {
    const question = {
      id: UID.b,
      type: "question",
      stem: [imageBlock(UID.c, "https://i.ibb.co/fake.png", "figura")],
      answer: { kind: "open" },
    } as Block;
    const out = stripFabricatedImages(resultWith([question]), new Set());
    const stem = (out.document.blocks[0] as Extract<Block, { type: "question" }>).stem;
    expect(stem[0]).toEqual({ id: UID.c, type: "paragraph", content: [{ type: "text", text: "figura" }] });
  });

  it("strips all images when the allowlist is empty (manual paste)", () => {
    const res = resultWith([imageBlock(UID.a, "https://x.co/a.png", "a")]);
    const out = stripFabricatedImages(res, new Set());
    expect((out.document.blocks[0] as { type: string }).type).toBe("paragraph");
  });

  it("matches an allowed url even if the image src is HTML-escaped", () => {
    const res = resultWith([imageBlock(UID.a, "https://x.co/a.png?w=1&amp;h=2", "a")]);
    const out = stripFabricatedImages(res, new Set(["https://x.co/a.png?w=1&h=2"]));
    expect((out.document.blocks[0] as { type: string }).type).toBe("image");
  });

  it("leaves non-image blocks untouched", () => {
    const para = { id: UID.a, type: "paragraph", content: [{ type: "text", text: "hi" }] } as Block;
    const out = stripFabricatedImages(resultWith([para]), new Set());
    expect(out.document.blocks[0]).toEqual(para);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/imageSourceGuard.test.ts`
Expected: FAIL — `stripFabricatedImages is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `supabase/functions/_shared/imageSourceGuard.ts`:

```ts
/** Turn a fabricated image block into a text paragraph carrying its alt. */
function imageToParagraph(block: Extract<Block, { type: "image" }>): Block {
  const alt = block.alt.trim();
  const content: RichText = alt ? [{ type: "text", text: alt }] : [];
  return {
    id: block.id,
    type: "paragraph",
    content,
    ...(block.style && { style: block.style }),
  };
}

/**
 * Rewrite every image block whose `src` did not come from an [IMAGEM:] marker in
 * the original activity into a text paragraph (its alt as a note). Walks
 * top-level blocks and question stems — images never nest deeper (the AI schema
 * forbids questions inside stems). Returns a new AdaptationResult; block counts
 * are preserved so the document stays valid (blocks.min(1)).
 */
export function stripFabricatedImages(
  result: AdaptationResult,
  allowedSrcs: Set<string>,
): AdaptationResult {
  const clean = (block: Block): Block => {
    if (block.type === "image") {
      return allowedSrcs.has(normalizeUrl(block.src)) ? block : imageToParagraph(block);
    }
    if (block.type === "question") {
      return { ...block, stem: block.stem.map(clean) };
    }
    return block;
  };
  return {
    ...result,
    document: { ...result.document, blocks: result.document.blocks.map(clean) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/imageSourceGuard.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Verify 100% coverage on the new file**

Run: `docker compose exec app npx vitest run --coverage supabase/functions/_shared/imageSourceGuard.test.ts`
Expected: `imageSourceGuard.ts` at 100% statements/branches/functions/lines. If any branch is red (e.g. `style` absent path, empty-alt path), add the missing case before moving on.

---

### Task 3: Endurecer o prompt de imagem

**Files:**
- Modify: `supabase/functions/_shared/adaptationPrompt.ts:247-248`
- Test: `supabase/functions/_shared/adaptationPrompt.test.ts:60-69`

**Interfaces:**
- Consumes: nada novo.
- Produces: `buildSystemPrompt` passa a conter a proibição explícita de inventar imagens (mantém as strings já asseridas: `[IMAGEM:`, `bloco de imagem (type "image")`, `"src" EXATAMENTE igual`, `"alt"`, `NÃO deixe o marcador literal`).

- [ ] **Step 1: Write the failing test**

Add a new assertion block to the existing image test in `supabase/functions/_shared/adaptationPrompt.test.ts` (after line 69, inside `describe("buildSystemPrompt")`):

```ts
  it("forbids inventing images and tells the model to describe in text instead", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain("NUNCA invente");
    expect(prompt).toContain("URL inventada");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/adaptationPrompt.test.ts`
Expected: FAIL — the new `it` fails (`NUNCA invente` not found); the existing image test still passes.

- [ ] **Step 3: Write minimal implementation**

In `supabase/functions/_shared/adaptationPrompt.ts`, replace the two image lines (247-248):

```ts
- IMAGENS: o bloco "image" exige "src" (URL) e "alt" (texto alternativo descritivo).
- MARCADOR DE IMAGEM: quando o texto de uma questão contiver um marcador no formato [IMAGEM: <url>], você DEVE incluir, no enunciado (stem) dessa questão, um bloco de imagem (type "image") com "src" EXATAMENTE igual à <url> do marcador e um "alt" curto e descritivo (NUNCA deixe o "alt" vazio). NÃO deixe o marcador literal [IMAGEM: ...] no texto de saída — substitua-o pelo bloco "image".
```

with:

```ts
- IMAGENS — REGRA CRÍTICA: NUNCA invente imagens nem URLs de imagem. Só inclua um bloco de imagem (type "image") quando o texto original contiver um marcador no formato [IMAGEM: <url>]; nesse caso, no enunciado (stem) da questão correspondente, use "src" EXATAMENTE igual à <url> do marcador e um "alt" curto e descritivo (NUNCA deixe o "alt" vazio), e NÃO deixe o marcador literal [IMAGEM: ...] no texto de saída — substitua-o pelo bloco "image". Se uma figura ajudaria mas NÃO há marcador [IMAGEM:] no original, descreva-a em TEXTO (um parágrafo) — jamais gere um bloco "image" com URL inventada.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/adaptationPrompt.test.ts`
Expected: PASS — new assertion green; the pre-existing image assertions (still referencing the preserved strings) stay green.

---

### Task 4: Ligar o guard no edge (glue) + validação real

**Files:**
- Modify: `supabase/functions/adapt-activity/index.ts` (import; após `:145`; no return de sucesso `:267-277`)

**Interfaces:**
- Consumes: `extractImageMarkers`, `stripFabricatedImages` (Tasks 1-2).
- Produces: o `adaptation` retornado ao client já passou pelo strip.

- [ ] **Step 1: Add the import**

In `supabase/functions/adapt-activity/index.ts`, after the existing `_shared/adaptActivityCore.ts` import block (ends at line 14), add:

```ts
import { extractImageMarkers, stripFabricatedImages } from "../_shared/imageSourceGuard.ts";
```

- [ ] **Step 2: Build the allowlist from the sanitized activity**

Right after `const sanitizedActivity = sanitize(original_activity, MAX_ACTIVITY_CHARS);` (line 145), add:

```ts
      const allowedImageSrcs = extractImageMarkers(sanitizedActivity);
```

- [ ] **Step 3: Strip fabricated images on success**

In the success branch (`if (interpreted.ok) { ... }`), replace `adaptation: interpreted.result,` (line 269) with a cleaned result. Change the return object so it reads:

```ts
          return new Response(
            JSON.stringify({
              adaptation: stripFabricatedImages(interpreted.result, allowedImageSrcs),
              model_used: modelName,
              tokens_used: totalTokens,
              credits_charged: creditsCharged,
              is_first_free: isFirstFree,
              disclaimer: "Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
```

- [ ] **Step 4: Typecheck + full Vitest suite + Deno bundle**

Run: `make typecheck && make test`
Expected: typecheck clean; full suite green; coverage gate 100% (no drop — `index.ts` is coverage-excluded; `imageSourceGuard.ts` fully covered by Task 2).

Then confirm the edge function still bundles under Deno (index.ts is not Vitest-covered):

Run: `docker compose exec app deno check supabase/functions/adapt-activity/index.ts`
Expected: no type/import errors (the `.ts` extension import resolves under Deno).

- [ ] **Step 5: Real end-to-end validation (skill validate-adaptar)**

Invoke the **validate-adaptar** skill to exercise the real flow (local Supabase + edge bundle + Gemini + browser):
- Gerar uma adaptação a partir de uma atividade **colada manualmente** que peça algo visual (ex.: "desenhe 2 bolas") → confirmar no browser (console limpo, sem CORS) e no PDF que **não** há imagem quebrada; a descrição aparece como texto.
- Gerar a partir de uma questão do **banco com `image_url`** real → confirmar que a imagem legítima **sobrevive** (aparece na tela e no PDF).

Expected: nenhuma URL externa fabricada renderizada; imagem legítima do banco preservada.

- [ ] **Step 6: Commit — AGUARDAR APROVAÇÃO DO USUÁRIO**

Não commitar automaticamente (regra do projeto). Após o usuário aprovar o teste manual, em uma feature branch:

```bash
git checkout -b fix/adaptar-imagem-fabricada
git add supabase/functions/_shared/imageSourceGuard.ts \
        supabase/functions/_shared/imageSourceGuard.test.ts \
        supabase/functions/_shared/adaptationPrompt.ts \
        supabase/functions/_shared/adaptationPrompt.test.ts \
        supabase/functions/adapt-activity/index.ts
git commit -m "fix(adaptar): filtra imagens fabricadas pela IA e endurece o prompt"
```

(Mensagem seguindo a skill `commit-crafting`. Staging explícito por arquivo por causa do pre-commit que arrasta WIP — há 7 arquivos não relacionados no working tree.)

---

## Manter doc viva

O `adapt-activity` passa a filtrar imagens (novo comportamento de contrato). Atualizar a skill `dominio-orientador` (gotcha de dados / comportamento do fluxo Adaptar) **nesta tarefa**, antes de considerar pronto — regra do CLAUDE.md + skill `keeping-skills-current`.

## Self-Review (feito)

- **Cobertura do spec:** prompt (Task 3), filtro determinístico + nota de texto (Tasks 1-2), wire edge (Task 4), suposição do `sanitize()` **resolvida** (markers sobrevivem; normalização trata `&amp;`). ✓
- **Placeholders:** nenhum — todo passo tem código/comando real. ✓
- **Consistência de tipos:** `extractImageMarkers`/`stripFabricatedImages` com as mesmas assinaturas em interfaces, testes e implementação; `Block`/`AdaptationResult`/`RichText` importados só como tipo. ✓
