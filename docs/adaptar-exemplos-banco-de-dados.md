# Adaptar — Exemplos de dados no banco (para POC)

> Acompanha [adaptar-editor-estilo-componentes.md](./adaptar-editor-estilo-componentes.md).
> Aqui está **como os dados realmente ficam gravados** na tabela `adaptations`, extraído
> do Supabase **local** (4 linhas de seed/teste, branch `feat/adaptar-canonical-restructure`).
> Use como matéria-prima fiel pra montar fixtures/POC sem adivinhar o shape.

---

## 1. A tabela `adaptations`

```
Column             | Type      | Nullable | Default
-------------------+-----------+----------+------------------
id                 | uuid      | not null | gen_random_uuid()
user_id            | uuid      | not null |
barrier_profile_id | uuid      |          |              (FK → barrier_profiles, ON DELETE SET NULL)
title              | text      | not null | ''
credits_spent      | integer   | not null | 0
created_at         | timestamptz | not null | now()
updated_at         | timestamptz | not null | now()
original_activity  | text      | not null | ''            (texto cru colado pelo usuário)
activity_type      | text      |          |               ('prova' | 'exercício' | …)
barriers_used      | jsonb     | not null | '[]'
observation_notes  | text      |          |
adaptation_result  | jsonb     | not null | '{}'          ← O BLOB CANÔNICO (ver §3)
status             | text      | not null | 'draft'        CHECK in ('draft','ready')
```

- **RLS owner-based:** o usuário só vê/edita as suas (`auth.uid() = user_id`). Super-admin tem acesso cross-tenant.
- O documento editado vive em **`adaptation_result -> 'document'`** (gotcha citado no CLAUDE.md).
- Saldo de crédito é coluna `credit_balance` em outra tabela — aqui só registramos `credits_spent`.

---

## 2. Exemplo de uma linha (colunas, sem o blob)

```json
{
  "id": "594d4c02-1a78-470c-84e1-ec72ddc1fb5a",
  "title": "1) A mensagem principal relaciona para propagar o é.",
  "status": "draft",
  "activity_type": "exercício",
  "credits_spent": 0,
  "observation_notes": null,
  "original_activity": "1) A mensagem principal relaciona para propagar o é.\n   A) Criar o mosquito da dengue ...",
  "barriers_used": [
    { "dimension": "tea", "barrier_key": "tea_abstracao",            "label": "Dificuldade com abstração excessiva", "is_active": true },
    { "dimension": "tea", "barrier_key": "tea_sobrecarga_sensorial", "label": "Sobrecarga sensorial",               "is_active": true },
    { "dimension": "tea", "barrier_key": "tea_comunicacao_social",   "label": "Dificuldade na comunicação social",  "is_active": true },
    { "dimension": "tea", "barrier_key": "tea_mudancas_inesperadas", "label": "Dificuldade com mudanças inesperadas","is_active": true }
  ]
}
```

> `barriers_used` é o snapshot das barreiras escolhidas no passo "Barreiras" (vêm de um
> `barrier_profile` ou da seleção avulsa). Cada item: `{ dimension, barrier_key, label, is_active }`.

---

## 3. O blob `adaptation_result`

Estrutura de topo (5 chaves):

```json
{
  "schemaVersion": 1,
  "document": { "blocks": [ /* … os blocos canônicos … */ ] },
  "strategies_applied": [
    "Linguagem Direta e Objetiva",
    "Suporte Visual (DUA)",
    "Estruturação da Tarefa (Chunking)",
    "Múltiplas Formas de Ação e Expressão (DUA)",
    "Clarificação de Vocabulário e Símbolos (DUA)",
    "Fornecimento de Scaffolding"
  ],
  "implementation_tips": [
    "Leia cada enunciado em voz alta com o aluno para garantir a compreensão do comando.",
    "Para a questão 3, permita que o aluno aponte para as palavras no banco de palavras antes de escrevê-las.",
    "Disponibilize uma folha de rascunho para os cálculos da questão 2, se necessário.",
    "Assegure um ambiente com o mínimo de distrações visuais e sonoras durante a aplicação."
  ],
  "pedagogical_justification": "A adaptação foi desenhada para mitigar a barreira da abstração, comum no TEA, sem reduzir o rigor cognitivo... A Questão 3, originalmente aberta ('explique com suas palavras'), foi convertida para completar lacunas com banco de palavras..."
}
```

- `document.blocks` é uma **lista ordenada** de blocos canônicos (o que o editor renderiza).
- `strategies_applied` / `implementation_tips` / `pedagogical_justification` são metadados
  pedagógicos produzidos pela IA — exibidos fora do editor (não fazem parte do documento editável).

---

## 4. Os blocos do `document` (exemplos reais, um por tipo)

> Todos os exemplos abaixo são JSON **literal extraído do banco** (apenas reindentado).
> Tipos de bloco vistos nas 4 linhas: `heading`, `paragraph`, `image`, `blockMath`,
> `inlineMath` (inline), `scaffolding`, `question`.

### 4.1 `heading`
```json
{
  "id": "ba8f9b9d-dc7f-45ff-9f07-239c934c81ab",
  "type": "heading",
  "level": 1,
  "content": [ { "type": "text", "text": "Prova Adaptada" } ]
}
```

### 4.2 `paragraph` com marcas inline + `inlineMath`
Mostra texto com `marks: ["bold"]` e uma fórmula inline (LaTeX em atributo, com `alt`):
```json
{
  "id": "785ee27e-fa4b-4cd5-a407-0028a06a95ec",
  "type": "paragraph",
  "content": [
    { "type": "text", "text": "Isso significa que um número ", "marks": ["bold"] },
    { "type": "inlineMath", "latex": "x", "alt": "x" },
    { "type": "text", "text": " multiplicado por ele mesmo é igual a 9.", "marks": ["bold"] }
  ]
}
```

### 4.3 `image` (como bloco no `stem`)
```json
{
  "id": "024d6a09-91b4-4a5d-a97e-876db3f99d99",
  "type": "image",
  "src": "https://i.imgur.com/r6kL0v6.png",
  "alt": "Uma imagem mostrando 2 maçãs, um sinal de mais, e depois mais 2 maçãs.",
  "width": 0.6,
  "alignment": "center"
}
```
> `width` é fração (0–1) e `alignment` ∈ left/center/right. Ambos opcionais — quando ausentes,
> a imagem usa o default (ver 4.6 onde a imagem não tem width/alignment).

### 4.4 `blockMath`
```json
{
  "id": "759a0d15-cdb0-428c-b05c-83590188b924",
  "type": "blockMath",
  "latex": "x^2 = 9",
  "alt": "x ao quadrado igual a 9"
}
```

### 4.5 `scaffolding` (andaime — banco de palavras)
```json
{
  "id": "a889f4d9-de39-4d85-b55a-cf13fbc001e8",
  "type": "scaffolding",
  "items": ["água", "glicose", "oxigênio", "sol", "carbônico"]
}
```

### 4.6 `question` — `multipleChoice` (com imagem + math no enunciado)
Exemplo mais completo: `stem` com 3 blocos (parágrafo, imagem, parágrafo com inlineMath),
`instruction` preenchida, e `answer` múltipla escolha com 1 correta.
```json
{
  "id": "3afdd41d-505a-4574-acd2-415bf4f2813b",
  "type": "question",
  "stem": [
    {
      "id": "bb839aa8-96c7-4749-bf34-ea491762f673",
      "type": "paragraph",
      "content": [ { "type": "text", "text": "Observe a imagem abaixo. Juntando os dois grupos de maçãs, com quantas maçãs ficamos no total?" } ]
    },
    {
      "id": "0340d9ee-43a6-43d7-a6ad-32308efbd9e9",
      "type": "image",
      "src": "https://i.ibb.co/Ld1JjX6/ISA-2plus2.png",
      "alt": "Uma imagem mostrando duas maçãs, um sinal de mais, e depois mais duas maçãs."
    },
    {
      "id": "12f7dbe0-bb93-4aee-953d-9c7377821e4a",
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Quanto é " },
        { "type": "inlineMath", "latex": "2 + 2", "alt": "2 mais 2" },
        { "type": "text", "text": "?" }
      ]
    }
  ],
  "instruction": [ { "type": "text", "text": "Marque a resposta correta." } ],
  "answer": {
    "kind": "multipleChoice",
    "alternatives": [
      { "id": "2ae9030e-5840-45e2-9fe0-5782d7f4d3fa", "content": [ { "type": "text", "text": "3" } ], "correct": false },
      { "id": "5a402026-c2a5-4ff8-af73-a89586fbf144", "content": [ { "type": "text", "text": "4" } ], "correct": true  },
      { "id": "a79bd4f8-1912-4616-aa34-dcc4aecbfc45", "content": [ { "type": "text", "text": "5" } ], "correct": false }
    ]
  },

  "number": 1,
  "points": 1,
  "difficulty": "facil"
}
```
> ⚠️ **Gotcha:** repare nos campos `number`, `points`, `difficulty` no fim. Eles **estão
> gravados no banco** (a IA os emitiu / shape antigo), mas **não fazem parte do schema
> canônico atual** nem são editáveis na UI (o `QuestionNodeView` mostra "Questão N"
> read-only por posição). O `validateDocument` (Zod) tende a **descartá-los** ao carregar.
> Importante decidir no POC: ignorar, formalizar no schema, ou migrar.

### 4.7 `question` — `open` (dissertativa, com imagem no enunciado)
```json
{
  "id": "859f3001-b4e8-4d0a-8e34-ab0c5323a124",
  "type": "question",
  "stem": [
    { "id": "5dd335fa-…", "type": "paragraph", "content": [ { "type": "text", "text": "Observe a imagem. Se você tem 2 maçãs e ganha mais 2 maçãs, com quantas maçãs você fica no total?" } ] },
    { "id": "024d6a09-…", "type": "image", "src": "https://i.imgur.com/r6kL0v6.png", "alt": "…", "width": 0.6, "alignment": "center" }
  ],
  "instruction": [ { "type": "text", "text": "Escreva sua resposta no espaço abaixo." } ],
  "answer": { "kind": "open", "answerLines": 1 },
  "number": 1, "points": 1, "difficulty": "facil"
}
```

### 4.8 `question` — `fillBlank` (lacunas + scaffolding no enunciado)
O `stem` traz um `scaffolding` (banco de palavras) e um parágrafo com lacunas numeradas;
o `answer.gaps` lista a chave de cada lacuna **na ordem**.
```json
{
  "id": "aa1f0b83-2542-49d2-b7c1-6439660f3c37",
  "type": "question",
  "stem": [
    { "id": "e78b9448-…", "type": "paragraph", "content": [ { "type": "text", "text": "O texto abaixo explica o que é a fotossíntese. Complete as lacunas com as palavras corretas do quadro." } ] },
    { "id": "a889f4d9-…", "type": "scaffolding", "items": ["água","glicose","oxigênio","sol","carbônico"] },
    { "id": "1d1bcf12-…", "type": "paragraph", "content": [ { "type": "text", "text": "A fotossíntese é o processo em que as plantas usam a luz do __________ (1), a __________ (2) ... liberam para o ar o gás __________ (5) que nós respiramos." } ] }
  ],
  "answer": {
    "kind": "fillBlank",
    "gaps": [
      { "id": "ea9ae109-…", "answer": "sol" },
      { "id": "b634fd22-…", "answer": "água" },
      { "id": "9fd7d776-…", "answer": "carbônico" },
      { "id": "ac58ed64-…", "answer": "glicose" },
      { "id": "5bfa769a-…", "answer": "oxigênio" }
    ]
  },
  "number": 3, "points": 1, "difficulty": "medio"
}
```

### 4.9 `question` — `matching` (associação) — **exemplo vazio**
A única ocorrência de `matching` no banco local está **vazia** (par sem conteúdo) — foi
inserida manualmente pela toolbar e não preenchida. Útil pra ver o shape "recém-criado":
```json
{
  "id": "39b97319-439e-4584-93be-3936e5883c6f",
  "type": "question",
  "stem": [ { "id": "7fc4843c-…", "type": "paragraph", "content": [] } ],
  "answer": {
    "kind": "matching",
    "pairs": [ { "id": "2584049c-…", "left": [], "right": [] } ]
  }
}
```
> `left`/`right` são RichText (arrays de inline). Aqui estão vazios.

---

## 5. Tipos de resposta — cobertura no banco vs schema

| `answer.kind` | No banco local? | Shape do campo de resposta |
|---|---|---|
| `multipleChoice` | ✅ (vários) | `alternatives[]: { id, content: RichText, correct: bool }` — exatamente 1 `correct: true` |
| `open` | ✅ | `answerLines?: number` |
| `fillBlank` | ✅ | `gaps[]: { id, answer: string }` (ordem = ordem das lacunas no texto) |
| `matching` | ✅ (vazio) | `pairs[]: { id, left: RichText, right: RichText }` |
| `trueFalse` | ❌ | `items[]: { id, content: RichText, value: bool }` |
| `checkbox` | ❌ | `items[]: { id, content: RichText, checked: bool }` |
| `ordering` | ❌ | `items[]: { id, content: RichText, position: number }` |
| `table` | ❌ | `rows: RichText[][]` |

> Os 4 que faltam **existem no schema e no dropdown "Questão"** da toolbar — só não há
> seed local. Os shapes acima vêm do schema (`src/lib/adaptation/canonical/schema.ts:107-187`).

---

## 6. Anatomia do inline (RichText)

Onde aparece "RichText" acima (conteúdo de parágrafo, alternativa, célula, caption,
instrução, par de associação), o shape é um **array de nós inline**:

```json
[
  { "type": "text", "text": "texto normal" },
  { "type": "text", "text": "em negrito", "marks": ["bold"] },
  { "type": "text", "text": "negrito+itálico", "marks": ["bold","italic"] },
  { "type": "inlineMath", "latex": "x^2", "alt": "x ao quadrado" }
]
```
- Marcas possíveis: `bold`, `italic`, `underline`, `strike`, e cor (via `textStyle`, allowlist).
- `inlineMath` é nó de primeira classe (LaTeX em `latex`, com `alt` para acessibilidade).

---

## 7. Resumo para o POC

1. **Carregue de `adaptation_result->'document'`** — é o documento canônico. Os 3 metadados
   pedagógicos (`strategies_applied`, etc.) e o `schemaVersion` ficam ao lado, fora do documento.
2. **Blocos top-level** observados: `heading`, `paragraph`, `image`, `blockMath`, `scaffolding`,
   `question`. (`divider` existe no schema, sem seed.)
3. **`question` = `stem` (Block[] recursivo) + `instruction?` (RichText) + `answer` (8 kinds).**
   Imagens/math/scaffolding vão **dentro do `stem`** — é assim que "imagem em qualquer posição" já funciona.
4. **Campos fantasma** `number`/`points`/`difficulty` aparecem em questões antigas no banco
   mas não no schema canônico — decidir política (descartar/formalizar/migrar) no POC.
5. **`matching` de seed está vazio** — gerar um exemplo preenchido antes de testar render/PDF.
6. Todos os ids são UUIDs estáveis por nó (Tiptap UniqueID) — preserve-os em qualquer round-trip.
```

> Dados extraídos do Supabase local em 2026-06-09 (4 linhas de seed). Para puxar de novo:
> `docker exec supabase_db_orientador-digital-b2c psql -U postgres -d postgres -t -A -c "SELECT jsonb_pretty(adaptation_result) FROM adaptations LIMIT 1;"`
