# Paridade tela↔PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Área FRÁGIL** — executar via agente `pdf-debugger`.

**Goal:** Aproximar o PDF (`@react-pdf/renderer`) do renderer de tela nos itens escolhidos: nº da questão, instrução/enunciado, unidade px→pt de `NodeStyle`, tamanho de headings e bordas de tabela.

**Architecture:** Correções cirúrgicas nos mappers de PDF, cada uma espelhando o valor que a tela já usa. Testes usam o harness existente (`textOf`/navegação de `.props`) em `mappers.test.ts`/`nodeStyleToPdf.test.ts`. A prova final é um export real via skill `validate-adaptar` (Vitest não rasteriza fontes/pesos).

**Tech Stack:** React + `@react-pdf/renderer`; Vitest (gate 100%); skill `validate-adaptar`; agente `pdf-debugger`.

## Global Constraints

- **TDD obrigatório**: Red → Green → Refactor. Toda mudança nasce de um teste (ou de um teste existente atualizado para o valor correto).
- **Gate de cobertura 100%** em `vitest.config.ts` — `src/**` incluído. Não baixar threshold.
- **Nunca commit automático.** Preparar e **aguardar aprovação** do usuário após teste manual. Um único commit ao final (ou por bundle, se o usuário preferir), em feature branch separada do trabalho de imagem.
- **Área FRÁGIL** (`src/components/adaptation/render/pdf/`): executar via agente `pdf-debugger`. NÃO tocar o documento canônico (`src/lib/adaptation/`).
- **Container**: rodar testes via `docker compose exec app npx vitest run <arquivo>` (targeted) e `make test` (suíte + gate). Garanta o container up (`make start`).
- **Modelo de unidade (contrato de paridade):** `NodeStyle`/`spacingAfter`/`width` de imagem/`blockSpacing` são **px** (unidade da tela); o PDF converte para **pt** com `pt = px × 72/96` (= ×0.75). Base do documento: `BASE_FONT_PT = 12` (pt) ↔ 16px na tela. Runs (`richTextPdf`) e `pageStyle.fontSize` já são pt em ambos — **não** converter esses.
- **Idioma**: UI pt-BR; código/ comentários em inglês.

---

### Task 1: #2 — Número da questão em negrito (sem cinza)

**Files:**
- Modify: `src/components/adaptation/render/pdf/PdfQuestion.tsx:40`
- Test: `src/components/adaptation/render/pdf/mappers.test.ts`

**Interfaces:** nenhuma nova. Espelha `QuestionView.tsx:47` (`font-bold text-foreground`).

- [ ] **Step 1: Write the failing test** — add inside `describe("PdfQuestion — auto number header")` in `mappers.test.ts`:

```ts
  it("renders the question number in bold, not muted gray (parity with screen)", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("s") }],
      answer: { kind: "open" },
    };
    const el = PdfQuestion({ block, number: 1 }) as ReactElement;
    const row = (el.props.children as ReactElement[])[0];
    const numberText = (row.props.children as ReactElement[])[0];
    const style = numberText.props.style as { fontWeight?: string; color?: string };
    expect(style.fontWeight).toBe("bold");
    expect(style.color).toBeUndefined();
  });
```

- [ ] **Step 2: Run test — verify it fails**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: FAIL — `fontWeight` is `undefined`, `color` is `"#555555"`.

- [ ] **Step 3: Implement** — in `PdfQuestion.tsx:40` replace:

```tsx
        <Text style={{ color: "#555555", marginRight: 6 }}>{displayNumber}.</Text>
```

with:

```tsx
        <Text style={{ fontWeight: "bold", marginRight: 6 }}>{displayNumber}.</Text>
```

- [ ] **Step 4: Run test — verify it passes**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: PASS.

---

### Task 2: #4 — Instrução e enunciado no tamanho text-sm

**Files:**
- Modify: `src/components/adaptation/render/pdf/PdfQuestion.tsx` (novo const + `:31` enunciado + `:52` instrução)
- Test: `src/components/adaptation/render/pdf/mappers.test.ts`

**Interfaces:** `QUESTION_SUB_FS = 10.5` (pt) — o text-sm da tela (14px) convertido px→pt. Aplica-se a instrução **e** enunciado (ambos usam `text-sm` na tela: `QuestionView.tsx:39,62`). Incluir o enunciado evita a nova inconsistência "instrução pequena / enunciado grande" — se preferir só a instrução, remover a linha do enunciado.

- [ ] **Step 1: Write the failing tests** — add inside `describe("PdfQuestion — auto number header")`:

```ts
  it("renders the instruction at the smaller text-sm size (parity with screen)", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("stem") }],
      instruction: rt("faça assim"),
      answer: { kind: "open" },
    };
    const el = PdfQuestion({ block, number: 1 }) as ReactElement;
    const instructionView = (el.props.children as ReactElement[])[1];
    const instructionText = (instructionView.props as { children: ReactElement }).children;
    expect((instructionText.props.style as { fontSize?: number }).fontSize).toBe(10.5);
  });

  it("renders the enunciado at the smaller text-sm size (parity with screen)", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("stem") }],
      enunciado: rt("contexto"),
      enunciadoPosition: "above",
      answer: { kind: "open" },
    };
    const el = PdfQuestion({ block, number: 1 }) as ReactElement;
    const row = (el.props.children as ReactElement[])[0];
    const innerView = (row.props.children as ReactElement[])[1];
    // position "above" → enunciado View is the first child of the inner column
    const enunciadoView = (innerView.props.children as unknown[])[0] as ReactElement;
    const enunciadoText = (enunciadoView.props as { children: ReactElement }).children;
    expect((enunciadoText.props.style as { fontSize?: number }).fontSize).toBe(10.5);
  });
```

- [ ] **Step 2: Run test — verify it fails**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: FAIL — `fontSize` is `undefined` on both.

- [ ] **Step 3: Implement**

Add the constant just above the `PdfQuestion` function in `PdfQuestion.tsx` (after the `type QuestionBlock = ...` line):

```tsx
// text-sm on screen (14px) converted to the PDF unit (pt): 14 × 72/96 = 10.5pt.
// Applied to the question's instruction and enunciado to mirror QuestionView.
const QUESTION_SUB_FS = 10.5;
```

Change the enunciado `<Text>` (line 31) to:

```tsx
      <Text style={{ fontSize: QUESTION_SUB_FS }}>
```

Change the instruction `<Text>` (line 52) to:

```tsx
          <Text style={{ fontStyle: "italic", color: "#555555", fontSize: QUESTION_SUB_FS }}>
```

- [ ] **Step 4: Run test — verify it passes**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: PASS.

---

### Task 3: #7 — Converter `NodeStyle.fontSize`/`spacingAfter` px→pt

**Files:**
- Modify: `src/components/adaptation/render/pdf/nodeStyleToPdf.ts:20-31`
- Test: `src/components/adaptation/render/pdf/nodeStyleToPdf.test.ts` (atualizar + adicionar) e `mappers.test.ts` (atualizar 2 asserts)

**Interfaces:** `nodeStyleToPdf` passa a emitir `fontSize`/`marginBottom` em **pt** (`px × 72/96`). Consumidores (`PdfHeading`/`PdfParagraph`/`PdfQuestion`/etc.) não mudam.

- [ ] **Step 1: Update the failing tests**

In `nodeStyleToPdf.test.ts`, change the "maps every supported field" expectation (lines 18-24) so `fontSize` and `marginBottom` are converted:

```ts
    ).toEqual({
      fontFamily: "Times-Roman",
      fontSize: 10.5,      // 14px → 10.5pt
      textAlign: "center",
      color: "#2563EB",
      marginBottom: 9,     // 12px → 9pt
    });
```

Add a dedicated conversion test after it:

```ts
  it("converts fontSize and spacingAfter from px (screen) to pt (PDF)", () => {
    const out = nodeStyleToPdf({ fontSize: 16, spacingAfter: 20 });
    expect(out.fontSize).toBe(12);     // 16px → 12pt (matches the 12pt doc base)
    expect(out.marginBottom).toBe(15); // 20px → 15pt
  });
```

In `mappers.test.ts`, update the two asserts that encode the old raw-px-as-pt behavior:
- The PdfParagraph test "outer View carries the spacingAfter from nodeStyle as marginBottom" (`style: { spacingAfter: 20 }`): change `.toBe(20)` → `.toBe(15)`.
- The PdfHeading test "spacingAfter from nodeStyle overrides the default marginBottom" (`style: { spacingAfter: 16 }`): change `.toBe(16)` → `.toBe(12)`.

- [ ] **Step 2: Run tests — verify they fail**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/nodeStyleToPdf.test.ts src/components/adaptation/render/pdf/mappers.test.ts`
Expected: FAIL — current code returns the raw px values (14/12/20/16), not the converted pt.

- [ ] **Step 3: Implement** — in `nodeStyleToPdf.ts`, add the helper and convert:

Add above `nodeStyleToPdf`:

```ts
/** Convert px (screen/canonical NodeStyle unit) to pt (PDF unit). 1px = 72/96 pt. */
const pxToPt = (px: number): number => px * (72 / 96);
```

Change line 25:

```ts
  if (style.fontSize !== undefined) out.fontSize = pxToPt(style.fontSize);
```

Change line 28:

```ts
  if (style.spacingAfter !== undefined) out.marginBottom = pxToPt(style.spacingAfter);
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/nodeStyleToPdf.test.ts src/components/adaptation/render/pdf/mappers.test.ts`
Expected: PASS.

---

### Task 4: Reconciliar tamanho dos headings (px→pt)

**Files:**
- Modify: `src/components/adaptation/render/pdf/PdfLeafBlocks.tsx:30`
- Test: `src/components/adaptation/render/pdf/mappers.test.ts`

**Interfaces:** `HEADING_SIZE` passa de `{1:22,2:18,3:15}` (pt inflado) para os tamanhos da tela convertidos px→pt: h1 `text-2xl`=24px→**18**, h2 `text-xl`=20px→**15**, h3 `text-lg`=18px→**13.5** (`HeadingBlockView.tsx:12-16`).

- [ ] **Step 1: Update/add the failing tests**

In `mappers.test.ts`, the existing "inner Text carries the heading font size" test uses `level: 2` and expects `18` — change that expectation to `15`. Then add a comprehensive test in the same `describe`:

```ts
  it("reconciles heading sizes to px→pt (h1 18pt, h2 15pt, h3 13.5pt)", () => {
    const sizeOf = (level: 1 | 2 | 3) => {
      const el = PdfHeading({
        block: { id: id(1), type: "heading", level, content: rt("h") },
        blockGap: DEFAULT_BLOCK_GAP_PT,
      }) as ReactElement;
      const inner = (el.props as { children: ReactElement }).children;
      return (inner.props.style as { fontSize?: number }).fontSize;
    };
    expect(sizeOf(1)).toBe(18);
    expect(sizeOf(2)).toBe(15);
    expect(sizeOf(3)).toBe(13.5);
  });
```

- [ ] **Step 2: Run test — verify it fails**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: FAIL — sizes are still 22/18/15.

- [ ] **Step 3: Implement** — in `PdfLeafBlocks.tsx:30` replace:

```ts
const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 22, 2: 18, 3: 15 };
```

with:

```ts
// Screen heading sizes (text-2xl/xl/lg = 24/20/18px) converted px→pt for parity.
const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 18, 2: 15, 3: 13.5 };
```

- [ ] **Step 4: Run test — verify it passes**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: PASS.

---

### Task 5: #5 — Bordas de tabela colapsadas

**Files:**
- Modify: `src/components/adaptation/render/pdf/PdfAnswer.tsx:132-160` (case `table`)
- Test: `src/components/adaptation/render/pdf/mappers.test.ts`

**Interfaces:** simula `border-collapse`: container com borda **topo+esquerda**; cada célula com borda **direita+baixo**. Remove o `borderWidth: 1` (4 lados) que dobrava as linhas internas.

- [ ] **Step 1: Write the failing test** — add inside `describe("PdfAnswer")` in `mappers.test.ts`:

```ts
  it("draws collapsed table borders — container top/left, cells right/bottom (no doubled lines)", () => {
    const el = PdfAnswer({
      answer: { kind: "table", rows: [[rt("H1"), rt("H2")], [rt("a"), rt("b")]] },
    }) as ReactElement;
    const container = el.props.style as { borderTopWidth?: number; borderLeftWidth?: number };
    expect(container.borderTopWidth).toBe(1);
    expect(container.borderLeftWidth).toBe(1);
    const headerRow = (el.props.children as unknown[])[0] as ReactElement;
    const headerCell = (headerRow.props.children as ReactElement[])[0];
    const cell = headerCell.props.style as {
      borderRightWidth?: number;
      borderBottomWidth?: number;
      borderWidth?: number;
    };
    expect(cell.borderRightWidth).toBe(1);
    expect(cell.borderBottomWidth).toBe(1);
    expect(cell.borderWidth).toBeUndefined();
  });
```

- [ ] **Step 2: Run test — verify it fails**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: FAIL — cells still use `borderWidth: 1`; container has no border.

- [ ] **Step 3: Implement** — replace the whole `case "table": { ... }` block (lines 132-160) with:

```tsx
    case "table": {
      const [header, ...body] = answer.rows;
      // Simulate border-collapse (Yoga has none): the container draws the top+left
      // edges, each cell draws its right+bottom — so every interior line is drawn
      // once instead of doubled.
      const cell = {
        flexGrow: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: "#999999",
        padding: 3,
      } as const;
      return (
        <View style={{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#999999" }}>
          {header && (
            <View style={{ flexDirection: "row" }}>
              {header.map((c, i) => (
                <View key={i} style={cell}>
                  <Text style={{ fontWeight: "bold" }}>
                    <PdfRichText content={c} />
                  </Text>
                </View>
              ))}
            </View>
          )}
          {body.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {row.map((c, i) => (
                <View key={i} style={cell}>
                  <Text>
                    <PdfRichText content={c} />
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }
```

- [ ] **Step 4: Run test — verify it passes**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: PASS (a existing "renders a table header row and body rows" continua verde — só checa texto).

---

### Task 6: #3 — Peso dos headings (h2/h3 semibold) — implementar + verificar/deferir

**Files:**
- Modify: `src/components/adaptation/render/pdf/PdfLeafBlocks.tsx` (novo `HEADING_WEIGHT` + `:41`)
- Test: `src/components/adaptation/render/pdf/mappers.test.ts`

**Interfaces:** `HEADING_WEIGHT = {1:"bold", 2:"semibold", 3:"semibold"}` (espelha `HeadingBlockView` LEVEL_CLASS). **Caveat:** as fontes registradas ([registerFonts.ts](../../../src/components/adaptation/render/pdf/registerFonts.ts)) só têm 400/700 — semibold (600) pode não renderizar ou (pior) fazer o react-pdf lançar em tempo de export. O teste unitário só valida a prop; a segurança real vem do Step 5 (export via validate-adaptar).

- [ ] **Step 1: Write the failing test** — add inside the heading `describe` in `mappers.test.ts`:

```ts
  it("weights headings per level to match the screen (h1 bold, h2/h3 semibold)", () => {
    const weightOf = (level: 1 | 2 | 3) => {
      const el = PdfHeading({
        block: { id: id(1), type: "heading", level, content: rt("h") },
        blockGap: DEFAULT_BLOCK_GAP_PT,
      }) as ReactElement;
      const inner = (el.props as { children: ReactElement }).children;
      return (inner.props.style as { fontWeight?: string }).fontWeight;
    };
    expect(weightOf(1)).toBe("bold");
    expect(weightOf(2)).toBe("semibold");
    expect(weightOf(3)).toBe("semibold");
  });
```

- [ ] **Step 2: Run test — verify it fails**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: FAIL — all levels currently render `"bold"`.

- [ ] **Step 3: Implement** — add above `PdfHeading` in `PdfLeafBlocks.tsx`:

```ts
// Mirror HeadingBlockView's LEVEL_CLASS: h1 bold (700), h2/h3 semibold (600).
const HEADING_WEIGHT: Record<1 | 2 | 3, "bold" | "semibold"> = { 1: "bold", 2: "semibold", 3: "semibold" };
```

Change `PdfHeading` line 41 from `fontWeight: "bold"` to:

```tsx
      <Text style={{ fontSize: HEADING_SIZE[block.level], fontWeight: HEADING_WEIGHT[block.level], ...textStyle }}>
```

- [ ] **Step 4: Run test — verify it passes**

Run: `docker compose exec app npx vitest run src/components/adaptation/render/pdf/mappers.test.ts`
Expected: PASS (unit level).

- [ ] **Step 5: Real-render safety check (parte da validação final)**

Este item **precisa** do export real (Step no Task 7). Decisão baseada no que o export mostrar:
- **Renderiza sem erro e h2/h3 saem mais leves que h1** → manter.
- **react-pdf lança "font ... semibold/600 not found" (ou h2/h3 saem idênticos ao bold)** → FALLBACK: reverter `HEADING_WEIGHT` h2/h3 para `"bold"` (ou remover o map e voltar `fontWeight: "bold"`), reverter o teste do Step 1 para esperar `"bold"`, e **documentar #3 como DEFERIDO** (paridade 600 exige registrar um peso semibold nas fontes a11y — fora do escopo "barato").

---

### Task 7: Validação real (validate-adaptar) + confirmação do #6 + commit

**Files:** nenhum (verificação); commit ao final.

- [ ] **Step 1: Suíte completa + gate**

Run: `make test`
Expected: verde; cobertura 100% (sem queda).

- [ ] **Step 2: Typecheck**

Run: `make typecheck`
Expected: limpo.

- [ ] **Step 3: Export real via skill `validate-adaptar`**

Invocar a skill **validate-adaptar** e exportar um PDF de uma adaptação que contenha: uma questão com nº + instrução + enunciado, headings h1/h2/h3, um bloco com override de fonte/espaço (Aparência), e uma tabela. Confirmar visualmente:
- nº da questão em negrito/escuro (não cinza);
- instrução e enunciado menores (text-sm);
- override de fonte/espaço no tamanho físico correto (não ~33% maior);
- headings com tamanhos reconciliados;
- tabela com linhas simples (sem borda dobrada);
- **#6**: exportar com `pageStyle.fontFamily` não-default e confirmar que o **cabeçalho** (título/escola/professor/data) muda de fonte junto com o corpo (herança por cascata — confirma que não é bug);
- **#3**: aplicar a decisão do Task 6 Step 5.

Expected: paridade visual nos itens acima; math continua LaTeX cru (esperado — fora de escopo).

- [ ] **Step 4: Commit — AGUARDAR APROVAÇÃO DO USUÁRIO**

Não commitar automaticamente. Após aprovação, em feature branch separada da imagem:

```bash
git checkout -b fix/adaptar-paridade-pdf
git add src/components/adaptation/render/pdf/PdfQuestion.tsx \
        src/components/adaptation/render/pdf/PdfLeafBlocks.tsx \
        src/components/adaptation/render/pdf/PdfAnswer.tsx \
        src/components/adaptation/render/pdf/nodeStyleToPdf.ts \
        src/components/adaptation/render/pdf/nodeStyleToPdf.test.ts \
        src/components/adaptation/render/pdf/mappers.test.ts
git commit -m "fix(adaptar): aproxima PDF da tela (nº da questão, text-sm, unidade px→pt, headings, tabela)"
```

(Staging explícito por arquivo — há 7 arquivos não relacionados + os de fonte no working tree; o pre-commit arrasta WIP. Mensagem via skill `commit-crafting`. Se o usuário quiser, dividir em 3 commits por bundle.)

---

## Manter doc viva

As mudanças ficam dentro dos arquivos que o agente `pdf-debugger` já descreve (sem mudança de caminho/contrato). Se o comportamento documentado do agente mudar, atualizar a descrição do agente nesta tarefa.

## Self-Review (feito)

- **Cobertura do spec:** #2 (Task 1), #4 (Task 2, +enunciado), #7 (Task 3), heading size (Task 4), #5 (Task 5), #3 (Task 6, com deferral definido), #6 (Task 7 Step 3). Math (#1) e `elementFontSizes` explicitamente fora. ✓
- **Placeholders:** nenhum — código e comandos reais; valores exatos (10.5/12/15/18/13.5/9). ✓
- **Consistência:** `pxToPt`/`QUESTION_SUB_FS`/`HEADING_SIZE`/`HEADING_WEIGHT` usados de forma idêntica em impl e testes; testes existentes que codificam o bug (px-como-pt, heading L2=18) atualizados nas Tasks 3-4. ✓
- **Risco isolado:** #3 é o único item cuja renderização real é incerta (fontes 400/700) — tratado com verificação no export + fallback documentado. ✓
