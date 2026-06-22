---
name: commit-crafting
description: >-
  Use ao preparar um commit neste projeto — quando o usuário pedir "faz o commit",
  "commita isso", "gera a mensagem de commit", "qual a mensagem desse commit", ou ao
  fechar uma fase de TDD (RED/GREEN/REFACTOR). Garante a convenção: prefixo
  Conventional Commits (test:/feat:/fix:/refactor:/docs:/chore:) + escopo, subject em
  pt-BR no imperativo, e a REGRA DURA do projeto: nunca commitar sozinho — sempre
  aguardar aprovação explícita do usuário após teste manual.
---

# Redigir commit — Orientador Digital B2C

## Passos

1. **Verifique a branch**: `git branch --show-current`. Se for `main`/`master`, PARE
   e peça uma feature branch antes de continuar.
2. **Veja o que está staged**: `git status --short` e `git diff --staged --stat`.
   Se nada estiver staged, mostre os modificados e pergunte o que incluir.
   NÃO rode `git add -A` sem confirmar o escopo com o usuário.
3. **Escolha o tipo** pelo conteúdo do diff:
   - `test:` só testes (fase RED) · `feat:` nova capacidade (fase GREEN) ·
     `refactor:` limpeza sem mudar comportamento (fase REFACTOR) ·
     `fix:` correção de bug · `docs:` / `chore:` / `style:`.
4. **Monte a mensagem**: `<tipo>(<escopo>): <subject pt-BR imperativo, ≤72 col>`.
   - Escopo = área tocada (ex.: `adaptar`, `styling`, `credits`, `pdf`, `auth`).
   - Corpo opcional explicando o "porquê" quando não for óbvio pelo diff.
5. **Apresente a mensagem ao usuário e PARE.** Não rode `git commit` até ele aprovar
   explicitamente (regra do projeto: nunca commit automático, só após teste manual).
6. Após aprovação: `git commit -m "..."`. Em ciclo de TDD, use o prefixo da fase atual.
