# Resumo

<!-- Uma ou duas frases sobre o que muda e por quê. -->

## Checklist de arquitetura (Refactor Wizard — Fase 6)

- [ ] **Single source of truth.** Se adicionei estado novo, está claro onde é o dono? Derivados usam `useMemo`, não `useState` + `useEffect` de sincronização.
- [ ] **useEffect.** Cada `useEffect` novo pertence a um *boundary* real (DOM, IO, timer) ou sincroniza state entre componentes? No segundo caso, sobe pra um custom hook ou vira prop.
- [ ] **Conversões de dados.** Nova transformação (DSL ↔ Structured ↔ Editable ↔ persistência)? Tem teste de idempotência / round-trip em `src/test/lib/*.property.test.ts`.
- [ ] **Persistência em DB.** Mudou algo em `adaptations_history.adaptation_result` ou schema? Considerou round-trip save → reload.
- [ ] **Tipos branded.** Texto DSL que entra no editor passou por `toCanonicalDsl`? Texto que sai para o layout passou por `toRawDsl`?

## Testes

<!-- Como validar: comandos, roteiro manual. -->

## Riscos

<!-- O que pode quebrar, em que parte do app, e como reverter. -->
