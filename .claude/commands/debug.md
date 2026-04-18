# /debug — Debugging sistemático com método científico

O usuário tem um bug. **Não tente consertar imediatamente.** Bugs têm causa raiz e, sem entendê-la, seu fix pode esconder o problema, criar bugs novos, ou deixar o original voltar. Aplique método científico e persista estado em `.claude/debug/<slug>.md` pra sobreviver a reset de contexto.

## Princípios

1. **Não arrume antes de reproduzir.** Se não consegue reproduzir, você está chutando.
2. **Uma hipótese por vez, da mais provável pra menos.** Não implemente fix de H1 e H2 juntos.
3. **Prove com log ou leitura de código, não com intuição.** Se "acha" que sabe a causa, é porque ainda não sabe.
4. **Toda fix exige teste de regressão.** Sem teste, o bug volta.
5. **Atualize o arquivo de debug a cada fase.** Esse arquivo é a fonte de verdade se o contexto resetar.

## Arquivo de sessão: `.claude/debug/<slug>.md`

Na fase 1, crie o arquivo (slug curto descritivo, ex: `wizard-step4-crash.md`). `.claude/debug/` está no `.gitignore` — esses arquivos são locais.

```markdown
# Debug: <título curto>

- **Iniciado**: <data ISO>
- **Branch**: <git branch --show-current>
- **Status**: investigando | aguardando reprodução | aguardando fix | aguardando teste | resolvido

## Sintoma
<o que o user reportou + exemplo concreto>

## Reprodução
<passos ou comando/teste que dispara o bug>

## Hipóteses
- [ ] H1: <descrição> — testando
- [ ] H2: <descrição>
- [x] H3: <descrição> — descartada (evidência: <por quê>)

## Causa raiz
<preencher após validação>

## Fix
<arquivo:linha + descrição curta>

## Teste de regressão
<caminho do teste, o que ele cobre>

## Lições
<1–3 bullets do que aprender pra não cair de novo>
```

## Fase 1 — REPRO

1. **Ative o modo debug** (silencia o Stop hook para não bloquear em testes vermelhos intencionais) rodando: `mkdir -p .claude/debug && touch .claude/debug/.active`
2. Pergunte ao user (se não estiver claro):
   - Sintoma exato (mensagem, comportamento observado vs esperado)
   - Como dispara (passos, input, ambiente)
   - Quando começou (sempre? após mudança recente?)
3. Tente reproduzir:
   - Teste? rode o teste, confirme que falha
   - Runtime? peça pro user rodar e colar o erro
   - Sem reprodução = pare e peça mais detalhes
4. Crie `.claude/debug/<slug>.md` preenchendo "Sintoma" e "Reprodução"

> **Sobre os hooks de teste**: enquanto `.claude/debug/.active` existir, o Stop hook fica silenciado. O PostToolUse continua rodando `vitest related` por arquivo editado e pode exibir falhas — na fase REPRO, essas falhas **são o bug reproduzido**, não um problema real. Continue.

**Pare**: "Bug reproduzido. Confirma o sintoma? Posso levantar hipóteses?"

## Fase 2 — HIPÓTESE

1. Liste 2–4 candidatas prováveis, baseadas em:
   - Onde o sintoma aparece (componente, função, stack trace)
   - Código que interage com essa área (grep/read)
   - Mudanças recentes: `git log -p --since="2 weeks ago" -- <arquivo>`
   - Áreas frágeis do CLAUDE.md (parsing PDF, renumeração de questões, etc.)
2. Ranqueie da mais provável pra menos, justificando em 1 linha cada
3. Atualize o arquivo de debug na seção "Hipóteses"

**Pare**: "Hipóteses levantadas. Começo pela H1 (<descrição>)?"

## Fase 3 — INSTRUMENTAÇÃO

1. Pra testar H1, escolha UMA estratégia:
   - `console.log`/`console.debug` em pontos críticos (marque com `// DEBUG`)
   - Ler o código da função suspeita com Read
   - Escrever um teste isolado que exercita o caminho suspeito
2. **NÃO edite código de produção** exceto logs temporários
3. Execute a reprodução com a instrumentação ativa

## Fase 4 — VALIDAÇÃO

1. Analise o output
2. Resultado:
   - **Confirmada**: atualize "Causa raiz" no arquivo, remova os logs, avance pra FIX
   - **Descartada**: marque H1 como descartada com evidência, volte à HIPÓTESE com H2
3. Todas as hipóteses descartadas → volte à REPRO (pode ser outro bug ou repro incompleto)

**Pare**: "Hipótese confirmada (ou descartada). Causa raiz identificada. Posso ir pro fix?"

## Fase 5 — FIX

1. Corrija a **causa raiz**, não o sintoma
   - Ex: bug é `undefined.foo` → não faça `x?.foo`, entenda por que x está undefined
2. Mudança mínima. Não refatore nada fora do escopo.
3. PostToolUse hook vai rodar os testes relacionados automaticamente.

## Fase 6 — REGRESSÃO

1. Escreva um teste que **falha sem o fix e passa com o fix**:
   - Se criou um teste na fase REPRO, reaproveite
   - Caso contrário, crie em `src/test/` usando os helpers (`mockAuthHook`, `createSupabaseMock`, `createTestWrapper`) e fixtures
2. Garanta que:
   - O teste novo passa
   - Nenhum teste existente quebrou
3. Atualize o arquivo de debug com "Teste de regressão"

**Pare**: "Fix aplicado, regressão coberta. Posso encerrar e escrever lições?"

## Fase 7 — LIMPEZA

1. Procure por `// DEBUG` em arquivos modificados e remova tudo que você adicionou
2. Atualize o arquivo de debug:
   - Status = `resolvido`
   - Seção "Lições" com 1–3 bullets
3. **Desative o modo debug** removendo o flag: `rm -f .claude/debug/.active` — isso reativa o Stop hook pra próximo turno
4. Sugira commit: `fix: <descrição curta do bug>`

## Regras

- **Nunca edite código de produção antes de reproduzir**
- **Nunca pule pra fix sem validar hipótese** — chutar cria bug novo
- **Nunca finalize sem teste de regressão**
- Se o user pedir pra "só arrumar rápido", lembre que bug sem regressão volta
- O arquivo `.claude/debug/<slug>.md` é fonte de verdade entre sessões

## Retomar debug existente

Se o user disser "retomar debug X" ou você detectar arquivo relevante em `.claude/debug/`:

1. Leia `.claude/debug/<slug>.md`
2. Veja o `Status` e quais hipóteses já foram testadas
3. Retome da fase correspondente sem repetir trabalho
