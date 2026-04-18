# /tdd — Ciclo Red-Green-Refactor

Você vai implementar a feature/fix usando TDD estrito. Execute cada fase separadamente e AGUARDE confirmação do usuário entre elas.

## Contexto do Projeto

- Testes em `src/test/` espelhando a estrutura de `src/`
- Helpers: `mockAuthHook()`, `createSupabaseMock()`, `createTestWrapper()` de `src/test/helpers.ts`
- Fixtures: `src/test/fixtures.ts`
- Rodar testes: `npm run test`
- Rodar lint: `npm run lint`

## Fase 1: RED (Teste que falha)

1. Identifique o comportamento a ser implementado
2. Escreva o teste em `src/test/` usando os helpers existentes
3. Rode `npm run test` — mostre que o teste FALHA
4. Mostre ao usuário:
   - O teste escrito
   - A mensagem de falha
   - O que o teste espera

**Pare aqui e pergunte**: "Teste RED escrito. O contrato está correto? Posso avançar para GREEN?"

> **Nota**: O hook `PostToolUse` vai rodar os testes após cada edição e mostrar falhas — isso é **esperado** na fase RED. Ignore as falhas do hook até confirmar o avanço para GREEN.

## Fase 2: GREEN (Implementação mínima)

1. Implemente o MÍNIMO necessário para o teste passar
2. Não adicione funcionalidade extra, não refatore
3. Rode `npm run test` — TODOS os testes devem passar (não só o novo)
4. Mostre ao usuário:
   - O código implementado
   - O resultado dos testes (todos passando)

**Pare aqui e pergunte**: "Teste GREEN. Todos os testes passam. Posso avançar para REFACTOR?"

## Fase 3: REFACTOR (Limpeza)

1. Melhore o código SEM mudar comportamento:
   - Extrair funções/componentes
   - Melhorar nomes
   - Remover duplicação
   - Melhorar tipagem
2. Rode `npm run test` — TODOS os testes devem continuar passando
3. Rode `npm run lint` — sem erros
4. Mostre ao usuário:
   - O que foi refatorado e por quê
   - Resultado dos testes + lint

**Pare aqui e pergunte**: "REFACTOR completo. Próximo ciclo RED ou finalizar?"

## Regras

- **Nunca pule uma fase**
- **Nunca implemente sem teste**
- **Nunca avance sem confirmação**
- Se descobrir que precisa de mais de um ciclo, liste os ciclos necessários no início
- Se um teste quebrar durante REFACTOR, pare e corrija antes de continuar
- Commits sugeridos:
  - RED: `test: add failing test for <feature>`
  - GREEN: `feat: implement <feature>`
  - REFACTOR: `refactor: clean up <feature>`
