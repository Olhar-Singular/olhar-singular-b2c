#!/usr/bin/env bash
# SessionStart hook: injeta estado atual do projeto no contexto do Claude.
#
# Por quê:
#   - Toda sessão nova o Claude começa "cego" ao estado do working tree, branch,
#     Supabase local e container da app. Com isso ele às vezes assume que o
#     ambiente está rodando quando não está, ou sugere `make up` sem precisar.
#   - Injetando um snapshot no início, ele pode agir com mais precisão sem
#     precisar de N chamadas de Bash só pra descobrir o óbvio.
#
# O que coleta:
#   - Git: branch atual, últimos 5 commits, número de arquivos modificados
#   - Supabase local: up/down (checa container supabase_db_<project_id>)
#   - App container: up/down (checa orientador-app)
#
# Saída:
#   - stdout vira additionalContext injetado no turno (via hookSpecificOutput JSON)
#   - exit 0 sempre (falha silenciosa — hook informativo não deve bloquear sessão)

set -o pipefail

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# ─── Git ───────────────────────────────────────────────────────────────
branch=$(git branch --show-current 2>/dev/null || echo "desconhecido")
dirty_count=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
recent_commits=$(git log --oneline -5 2>/dev/null || echo "(sem histórico)")

# ─── Supabase local ────────────────────────────────────────────────────
project_id=$(grep -E '^project_id' supabase/config.toml 2>/dev/null | sed -E 's/project_id[[:space:]]*=[[:space:]]*"([^"]+)"/\1/')
supabase_status="down"
if [ -n "$project_id" ]; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^supabase_db_${project_id}$"; then
    supabase_status="up"
  fi
fi

# ─── App container ─────────────────────────────────────────────────────
app_status="down"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^orientador-app$'; then
  app_status="up"
fi

# ─── Monta o bloco de contexto ─────────────────────────────────────────
context=$(cat <<EOF
## Estado do projeto no início da sessão

**Git**
- Branch: \`${branch}\`
- Arquivos modificados no working tree: ${dirty_count}
- Últimos 5 commits:
\`\`\`
${recent_commits}
\`\`\`

**Ambiente local**
- Supabase local: **${supabase_status}** (container \`supabase_db_${project_id:-?}\`)
- App container: **${app_status}** (\`orientador-app\`)

> Se precisar subir o ambiente: \`make start\` (Supabase + app juntos).
> Se já está tudo \`up\`, não rode \`make up\` de novo — só conecte.
EOF
)

# ─── Emite como additionalContext (JSON hookSpecificOutput) ────────────
# Usa jq pra escapar corretamente (newlines, aspas, backticks)
jq -n --arg ctx "$context" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
