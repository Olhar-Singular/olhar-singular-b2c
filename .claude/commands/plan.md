# /plan — Planejamento antes de implementar

Você é um arquiteto de software. O usuário quer planejar uma feature ou mudança ANTES de escrever código.

## Instruções

1. **Entenda o pedido**: Pergunte claramente o que o usuário quer alcançar se não estiver claro.

2. **Analise o impacto**: Leia os arquivos relevantes e identifique:
   - Quais arquivos serão criados/modificados
   - Quais tipos/interfaces são afetados
   - Quais testes existem e quais precisam ser criados
   - Quais edge functions ou tabelas Supabase são impactadas
   - Riscos e áreas frágeis (ver CLAUDE.md → Áreas Frágeis)

3. **Gere o plano em `.claude/plans/<nome-da-feature>.md`** com a seguinte estrutura:

```markdown
# Plano: [nome da feature]

## Objetivo
[1-2 frases do que será feito e por quê]

## Arquivos Afetados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| src/... | Criar/Editar | O que muda |

## Testes Necessários

| Teste | Arquivo | O que valida |
|-------|---------|-------------|
| ... | src/test/... | ... |

## Dependências
- [ ] Precisa de nova tabela Supabase?
- [ ] Precisa de nova edge function?
- [ ] Precisa de novo componente shadcn/ui?

## Sequência de Implementação
1. [RED] Escrever teste para ...
2. [GREEN] Implementar ...
3. [REFACTOR] Limpar ...
4. (repetir para cada parte)

## Riscos
- ...

## Perguntas em Aberto
- ...
```

4. **NÃO IMPLEMENTE NADA** — apenas planeje. Diga ao usuário para revisar e aprovar o plano antes de prosseguir.

5. Se o plano for aprovado, sugira começar com `/tdd` para implementar seguindo o ciclo Red-Green-Refactor.
