#!/usr/bin/env bash
# PostToolUse hook: ESLint rápido no arquivo editado.
#
# Estratégia:
#   - Lê file_path do tool_input via jq
#   - Filtra por extensão (.ts/.tsx/.js/.jsx) e diretório (src/ ou supabase/functions/)
#   - Roda eslint com --fix (auto-corrige formatação, imports não usados, etc.)
#   - node_modules mora no volume do container, não no host: se o eslint não resolve no
#     host, usa `docker compose exec app` (quando up); se o container está down, pula
#     sem bloquear o edit (aviso curto no stderr).
#
# Saída:
#   - exit 0: lint OK ou arquivo fora do escopo
#   - exit 2: lint falhou (Claude lê stderr e corrige)
#
# Escopo de validação:
#   - Este hook: ESLint no arquivo editado — feedback instantâneo (<5s).
#   - Testes NÃO rodam em hook do Claude. O gate de testes vive nos git hooks
#     (Husky): pre-commit roda `vitest related` nos staged; pre-push roda
#     typecheck + suíte completa. Ver .husky/.
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

# node_modules mora no volume do container (app_node_modules), não no host — então o
# eslint só resolve no host se as deps estiverem instaladas lá. Caso contrário, roda
# dentro do container `app` (quando up) ou pula sem bloquear (quando down).
rel="${file#"$CLAUDE_PROJECT_DIR"/}"

if [ -x node_modules/.bin/eslint ] && [ -d node_modules/@eslint/js ]; then
  # Host tem as deps: lint direto (caminho rápido).
  output=$(npx eslint "$file" --fix 2>&1)
  status=$?
elif docker compose ps --status running --services 2>/dev/null | grep -qx app; then
  # Deps no container e ele está up: lint via container. O projeto é bind-mount em
  # /app (WORKDIR), então --fix escreve de volta no arquivo do host.
  output=$(docker compose exec -T app npx eslint "$rel" --fix </dev/null 2>&1)
  status=$?
else
  # Sem eslint no host e container down: não dá pra lintar. Avisa e não bloqueia o edit.
  printf '[hook] eslint indisponível (deps no container, container down) — lint pulado em %s\n' "$rel" >&2
  exit 0
fi

if [ $status -ne 0 ]; then
  printf '%s\n' "$output" | tail -50 >&2
  printf '\n[hook] ESLint falhou em %s. Corrija antes de prosseguir.\n' "$file" >&2
  exit 2
fi

exit 0
