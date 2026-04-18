#!/usr/bin/env bash
# Stop hook: ao fim do turno do Claude, valida a suíte dos arquivos alterados.
#
# Por que Stop e não PostToolUse:
#   - Em uma conversa o Claude pode editar 5, 10 arquivos antes de parar.
#   - Rodar full suite a cada Edit é desperdício (ver test-related.sh).
#   - No final do turno, fazemos uma validação em lote com `vitest --changed`,
#     que pega todos os testes afetados por mudanças no working tree.
#
# Loop infinito? Não.
#   - Claude Code envia `stop_hook_active: true` quando já está rodando por
#     causa de um Stop hook anterior. Detectamos e saímos 0 nesse caso.
#
# Saída:
#   - exit 0 = OK ou sem mudanças relevantes
#   - exit 2 = falha → Claude não para, tenta corrigir antes de finalizar

set -o pipefail

# Lê stdin pra checar stop_hook_active (previne loop)
input=$(cat 2>/dev/null || echo '{}')
stop_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$stop_active" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Escape hatch: durante /debug, a fase REPRO tem teste vermelho intencional.
# O comando /debug cria .claude/debug/.active no início e remove no fim.
if [ -f .claude/debug/.active ]; then
  exit 0
fi

# Pula se nada foi mexido em src/ ou supabase/functions/
if ! git status --porcelain 2>/dev/null | grep -qE '(src/|supabase/functions/)'; then
  exit 0
fi

# vitest --changed = testes afetados por mudanças no working tree
# Roda dentro do container Docker (host pode ter Node antigo)
if docker compose ps --status running 2>/dev/null | grep -q 'app'; then
  output=$(docker compose exec -T app sh -c \
    "NODE_OPTIONS='--max-old-space-size=19456' npx vitest --changed --run --reporter=dot --passWithNoTests" 2>&1)
  status=$?
else
  output=$(NODE_OPTIONS='--max-old-space-size=19456' \
    npx vitest --changed --run --reporter=dot --passWithNoTests 2>&1)
  status=$?
fi

if [ $status -ne 0 ]; then
  printf '%s\n' "$output" | tail -80 >&2
  printf '\n[hook] Suíte de testes (arquivos alterados) falhou. Corrija antes de finalizar o turno.\n' >&2
  exit 2
fi

exit 0
