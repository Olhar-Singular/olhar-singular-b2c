# Upload direto de prova (caminho direto até a edição) — Design

**Data:** 2026-08-14 · **Status:** aprovado (conversa) · **Escopo:** fluxo Adaptar (wizard)

## Objetivo

Hoje, no fluxo **Adaptar**, montar a "atividade" a ser adaptada exige que o professor
selecione questões já salvas no **Banco de Questões** (ou cole texto manualmente) —
passo `activity_input` do wizard (`src/components/adaptation/steps/activity-input/StepActivityInput.tsx`).
Isso é lento quando o professor só quer pegar uma prova pronta (PDF/Word) e adaptar
ela inteira, sem curadoria questão a questão.

Criar um caminho direto: o professor sobe a prova (arquivo), escolhe as barreiras, e a
IA adapta a prova inteira preservando ao máximo a fidelidade ao original (**ordem das
questões e das imagens é crítica**), caindo direto na tela de edição (Revisar) ao
final — sem selecionar questões uma a uma.

Limite de negócio: provas grandes são cortadas em **9 questões**.

## Decisões (com o usuário)

- **Cobrança única** — a extração da prova não tem custo próprio; só a adaptação é
  cobrada (mesmo modelo de crédito/reserva de hoje). Extração vira um passo interno
  de graça, não um segundo produto cobrado como a extração do Banco de Questões.
- **Limite de 9 questões**: se a prova tiver mais, o sistema avisa ("sua prova tem N
  questões, o limite é 9 — apenas as 9 primeiras serão adaptadas") e só prossegue
  (gastando crédito) se o usuário confirmar. Não trunca silenciosamente.
- **Formatos aceitos:** PDF e Word (.docx), reaproveitando os parsers que já existem
  para os dois formatos no fluxo "Provas" do Banco de Questões.
- **Limite de caracteres para material não-prova** (referência para uma feature
  futura de upload de material/texto corrido, sem questões discretas): manter o
  `MAX_ACTIVITY_CHARS = 15.000` já existente em `adaptationPrompt.ts` em vez de um
  número novo — já calibrado com o orçamento de timeout/reask da IA, ~5-6 páginas A4.

## Veredito de viabilidade

**Viável, esforço médio-alto — mas de baixo risco técnico.** As duas metades da
feature já existem, testadas e em produção, só nunca foram costuradas juntas:

1. **Extração de PDF/Word com visão computacional, preservando ordem de leitura e
   recortando figuras por bounding box** — já existe no fluxo "Provas" do Banco de
   Questões (`extract-questions` + `parsePdf`/`extractDocxWithImages` +
   `autoCropFromBbox`). O mesmo modelo (`gemini-2.5-pro`) já é usado com visão ali.
2. **Fidelidade de imagem via marcador `[IMAGEM: url]` + ordem-por-posição-no-array
   como única fonte de verdade da ordem** — já é como `adapt-activity` e o schema
   canônico funcionam hoje (`imageSourceGuard.ts`, `canonical/schema.ts`).
3. **Cair direto na tela de Revisar** — já é o comportamento padrão do wizard depois
   de `Gerar` bem-sucedido (`StepGenerate` chama `onNext()` ao concluir); o mecanismo
   de "pular direto pro Revisar" também já existe como `editMode` em
   `CanonicalAdaptationWizard.tsx` (usado por `EditAdaptationPage`).

O trabalho novo é essencialmente **orquestração**: um novo passo de upload, uma nova
edge function de extração sem cobrança, e um reforço no prompt para não reordenar
nada — não é preciso nenhuma capacidade nova de IA nem mudança no schema canônico.

## Design

### Fluxo de dados

```
[Passo "Tipo"] → usuário escolhe "Prova" → aparecem 2 caminhos:
  (a) "Montar do Banco de Questões" → fluxo atual, inalterado
  (b) "Subir a prova completa" (NOVO) → StepUploadExam

[StepUploadExam] (novo passo, substitui "Atividade" nesse caminho)
  1. Dropzone (reaproveita o padrão de QuestionBankPage.tsx:1179-1202, mesma
     validação de magic bytes de fileValidation.ts)
  2. Parse client-side: parsePdf() ou extractDocxWithImages() (já existem,
     lib/utils/pdf-utils.ts e docx-utils.ts) → texto nativo + imagens por página
  3. Chama NOVA edge function extract-exam-for-adaptation (sem cobrança) →
     devolve questões ORDENADAS + figure_bbox por questão (mesmo shape que
     extract-questions já devolve hoje)
  4. Recorta figuras client-side (autoCropFromBbox, já existe) → sobe pro bucket
     question-images (já existe, já é público) → gera URLs reais
  5. Monta activityText com buildActivityTextFromExtraction() (novo, espelha
     buildActivityText.ts) inserindo [IMAGEM: url] na ORDEM extraída
  6. Se count > 9 questões → dialog de confirmação ANTES de prosseguir
     ("sua prova tem N questões, vamos adaptar só as 9 primeiras — continuar?")
     → trunca para as 9 primeiras (slice) só após confirmação
  7. seta data.activityType="prova", data.activityText=<texto montado> → onNext()

[Barreiras] → inalterado (StepBarrierSelection como hoje)

[Gerar] → StepGenerate inalterado, MAS o payload ganha um campo novo opcional
  fidelity_mode: true (só nesse caminho) → adapt-activity/index.ts repassa pro
  buildSystemPrompt() em adaptationPrompt.ts, que anexa um bloco extra:
  "MODO FIEL: preserve EXATAMENTE a ordem das questões e das imagens da atividade
  original; não reordene, não remova, não adicione questões além do limite já
  aplicado." Comportamento padrão (bank/paste) fica idêntico ao de hoje —
  campo ausente = prompt igual ao atual.
  Ao concluir, onNext() já leva pro Revisar — mecanismo existente, sem mudança.

[Revisar] → inalterado.
```

### Arquivos — novos

| Arquivo | Papel |
|---|---|
| `supabase/functions/_shared/examExtractionCore.ts` | Lógica de visão computacional (prompt + chamada Gemini + parse da resposta) **extraída** de `extract-questions/index.ts` pra ser compartilhada e testável via Vitest (padrão de `adaptActivityCore.ts`). Sem lógica de cobrança. |
| `supabase/functions/extract-exam-for-adaptation/index.ts` | Nova edge function: só auth check + glue HTTP, chama `examExtractionCore`. **Sem** `chargeCredits`/`deduct_credits`/`free_extraction_used` — é o passo "de graça" combinado na decisão de cobrança única. Scaffold via agente `edge-fn-writer`. |
| `src/components/adaptation/steps/upload-exam/StepUploadExam.tsx` | Novo passo do wizard — dropzone, parse, chamada à nova edge fn, crop+upload de imagens, dialog de limite de 9. |
| `src/components/adaptation/steps/upload-exam/buildActivityTextFromExtraction.ts` (+ `.test.ts`) | Espelha `buildActivityText.ts`, mas a partir do shape retornado pela extração (com `figure_bbox`/`image_page`) em vez de `SelectedQuestion[]`. |

### Arquivos — modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/extract-questions/index.ts` | Passa a delegar a lógica de visão pro novo `examExtractionCore.ts` (refactor puro — comportamento e cobrança do fluxo Banco de Questões continuam iguais). |
| `supabase/functions/_shared/adaptationPrompt.ts` | `buildSystemPrompt(barriers, { fidelityMode? })` — novo parâmetro opcional, bloco "MODO FIEL" adicional quando `true`. Testes novos cobrindo os dois casos. |
| `supabase/functions/adapt-activity/index.ts` | Aceita e repassa o novo campo opcional `fidelity_mode` do body. |
| `src/components/adaptation/CanonicalAdaptationWizard.tsx` | Novo conceito de caminho (`activityInputMode: "bank" \| "upload"`, guardado em `WizardData` ou state local do wizard) que troca o passo `activity_input` por `upload_exam` quando o usuário escolhe "Subir a prova completa" no passo Tipo. |
| `src/components/adaptation/steps/activity-type/StepActivityType.tsx` | Ao escolher "Prova", oferece as 2 opções de caminho (banco vs upload) antes de avançar. |
| skill `dominio-orientador` | Atualizar o mapa de domínio com o novo passo/fluxo (regra do CLAUDE.md — doc viva). |

**Reaproveitado sem alteração:** `extract-questions` (mesmo endpoint pago continua
existindo para o Banco de Questões), `imageSourceGuard.ts`, `canonical/schema.ts`,
bucket `question-images`, `pdf-utils.ts`, `docx-utils.ts`, `fileValidation.ts`,
`extraction-utils.ts` (`autoCropFromBbox`), `StepBarrierSelection.tsx`,
`StepGenerate.tsx`, `StepReview.tsx`, sistema de reserva de crédito
(`open_adapt_reservation`/`settle`/`reverse`).

### Ordem de implementação (TDD — Red→Green→Refactor por etapa)

1. Extrair `examExtractionCore.ts` de `extract-questions/index.ts` (refactor puro,
   com testes cobrindo a lógica pura); reconectar `extract-questions` a ele e
   confirmar que o fluxo Banco de Questões não regride (`validate-adaptar`).
2. Nova edge function `extract-exam-for-adaptation` (agente `edge-fn-writer` pro
   scaffolding, depois lógica própria testada em `_shared`).
3. `adaptationPrompt.ts` — parâmetro `fidelityMode` + bloco de prompt novo + testes.
4. `adapt-activity/index.ts` — repassar `fidelity_mode` do body.
5. `buildActivityTextFromExtraction.ts` + testes.
6. `StepUploadExam.tsx` + testes (mock da edge fn, mock do upload pro storage).
7. `CanonicalAdaptationWizard.tsx` + `StepActivityType.tsx` — troca de caminho.
8. Validação end-to-end real via skill `validate-adaptar`: subir uma prova de
   verdade com múltiplas páginas e pelo menos uma figura, conferir que ordem e
   imagens sobrevivem até o Revisar, e que o aviso de 9 questões dispara certo.
9. Atualizar skill `dominio-orientador`.

## Riscos / pontos em aberto

- **PDF escaneado sem camada de texto** extrai mal — limitação já existente hoje no
  Banco de Questões, não resolvida por esta feature.
- **"Não reordenar" é instrução de prompt, não garantia hard.** Um checo leve
  pós-geração (nº de questões que entrou vs. que saiu) é recomendado como rede de
  segurança adicional — não dá pra garantir 100% com saída generativa.
- Refatorar `extract-questions/index.ts` mexe num fluxo pago já em produção —
  exige rodar a suíte + `validate-adaptar` antes de considerar concluído, mesmo
  sendo refactor "sem mudança de comportamento".

## Verificação

- Vitest (`make test`) verde, gate de cobertura 100% mantido (novo código também
  precisa de teste — regra do projeto, sem exceção).
- pgTAP inalterado — não há mudança de schema/RPC prevista (dado extraído fica
  transiente no wizard, como `selectedQuestions` já é hoje; não persiste em coluna
  nova).
- E2E manual via skill `validate-adaptar` / `make verify-adaptar`: upload real de
  prova multi-página com figura → barreiras → gerar → conferir ordem/imagens no
  Revisar → conferir que só 1 cobrança de crédito aconteceu → conferir aviso de
  limite de 9 com uma prova grande.
