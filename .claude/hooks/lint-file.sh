#!/usr/bin/env bash
# PostToolUse hook: ESLint rápido no arquivo editado.
#
# Estratégia:
#   - Lê file_path do tool_input via jq
#   - Filtra por extensão (.ts/.tsx/.js/.jsx) e diretório (src/ ou supabase/functions/)
#   - Roda eslint com --fix (auto-corrige formatação, imports não usados, etc.)
#
# Saída:
#   - exit 0: lint OK ou arquivo fora do escopo
#   - exit 2: lint falhou (Claude lê stderr e corrige)
#
# Divisão rápido × lento:
#   - Fast hook (este): ESLint no arquivo editado — feedback instantâneo (<5s)
#   - Stop hook (test-suite.sh): vitest --changed ao fim do turno — cobre tudo
#
# Typecheck NÃO roda neste hook porque:
#   1. Cold run leva ~8s (estoura o target de <5s)
#   2. Existem erros de tipo pré-existentes que travariam todo edit
#   Pra typecheck manual: `npm run typecheck`

set -o pipefail

file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$file" ] && exit 0

# Filtra por extensão
case "$file" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

# Filtra por diretório relevante
case "$file" in
  */src/*|*/supabase/functions/*) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Escape hatch: durante sessão de debug o Claude pode estar intencionalmente
# introduzindo código "errado" pra reproduzir bug
if [ -f .claude/debug/.active ]; then
  exit 0
fi

# ESLint com --fix (auto-corrige quando possível)
output=$(npx eslint "$file" --fix 2>&1)
status=$?

if [ $status -ne 0 ]; then
  printf '%s\n' "$output" | tail -50 >&2
  printf '\n[hook] ESLint falhou em %s. Corrija antes de prosseguir.\n' "$file" >&2
  exit 2
fi

exit 0
