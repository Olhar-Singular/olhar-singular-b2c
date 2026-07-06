#!/usr/bin/env bash
# =============================================================================
# verify-adaptar — sobe o ambiente REAL completo pra validar o fluxo "Adaptar".
# =============================================================================
# Automatiza os ~15 passos manuais da skill validate-adaptar:
#   Supabase local (start) -> db reset -> seed (usuário confirmado + perfil c/
#   barreiras) -> .env.local efêmero -> functions serve (host) -> dev server
#   (no container). Deixa tudo pronto em http://localhost:3000.
#
# Uso:  bash supabase/scripts/verify-adaptar.sh [up|down]
#       (via Makefile: make verify-adaptar / make verify-adaptar-down)
#
# NÃO cobre Playwright/E2E/data-testid (ver o roadmap na skill validate-adaptar).
# Split host/container: Supabase + functions serve rodam no HOST (CLI); o dev
# server roda DENTRO do container app (node_modules mora no volume do container)
# e o Vite (8080 no container) é mapeado pra localhost:3000 no host.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DEV_URL="http://localhost:3000"
FN_LOG="/tmp/verify-adaptar-fnserve.log"
FN_PID="/tmp/verify-adaptar-fnserve.pid"
TEST_EMAIL="teste@teste.com"
TEST_PASS="123123"

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# curl "conectou?" — 0 em qualquer resposta HTTP, !=0 em conexão recusada.
# --max-time evita travar no primeiro boot lento do dev server (o loop re-tenta).
http_alive() { curl -s -o /dev/null --max-time 5 "$1"; }

# ─────────────────────────────────────────────────────────────────────────────
up() {
  command -v supabase >/dev/null 2>&1 || die "supabase CLI não encontrado."
  command -v psql      >/dev/null 2>&1 || die "psql não encontrado (postgresql-client)."

  say "Supabase local"
  if supabase status >/dev/null 2>&1; then
    ok "já no ar"
  else
    supabase start >/dev/null
    ok "subido"
  fi

  say "db reset (reaplica TODAS as migrations — apaga dados locais)"
  supabase db reset >/dev/null
  ok "schema recriado"

  say "Seed (usuário confirmado + perfil com barreiras reais)"
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -q -f supabase/scripts/seed_test_user.sql
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -q -f supabase/scripts/seed_verify_adaptar.sql
  ok "usuário $TEST_EMAIL / $TEST_PASS + perfil \"Aluno Teste (verify)\""

  say ".env.local efêmero (aponta o app pro Supabase local; gitignored)"
  local anon
  anon="$(supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d= -f2- | tr -d '"')"
  [ -n "$anon" ] || die "não consegui extrair a ANON_KEY do supabase status."
  cat > .env.local <<EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$anon
VITE_SUPABASE_PROJECT_ID=local
EOF
  ok ".env.local escrito"

  say "Edge functions (functions serve no host — injeta AI_API_KEY do .env)"
  # ATENÇÃO: o edge-runtime que sobe junto com `supabase start` serve as functions SEM a
  # AI_API_KEY (não lê o .env raiz) → adapt-activity responde 500 "No AI provider configured".
  # Por isso SEMPRE subimos nosso próprio `functions serve --env-file .env`, que substitui o
  # runtime com a chave. Só reusamos se ESTE processo (pidfile) ainda estiver vivo.
  if [ -f "$FN_PID" ] && kill -0 "$(cat "$FN_PID" 2>/dev/null)" 2>/dev/null; then
    ok "functions serve (com AI_API_KEY) já rodando — reusando"
  else
    : > "$FN_LOG"   # trunca pra não casar com um marcador de boot antigo
    nohup supabase functions serve --env-file .env >> "$FN_LOG" 2>&1 &
    echo $! > "$FN_PID"
    printf '  aguardando "Serving functions..."'
    local waited=0
    until grep -q 'Serving functions on' "$FN_LOG" 2>/dev/null; do
      printf '.'; sleep 2; waited=$((waited + 2))
      kill -0 "$(cat "$FN_PID")" 2>/dev/null || { echo; die "functions serve morreu no boot. Log: $FN_LOG"; }
      [ "$waited" -ge 120 ] && { echo; die "timeout no functions serve. Log: $FN_LOG"; }
    done
    echo; ok "functions serve pronto (AI_API_KEY injetada). Log: $FN_LOG"
  fi

  say "Dev server (container app: CMD já roda 'npm run dev'; Vite 8080 → host 3000)"
  docker compose up -d >/dev/null   # o CMD do container (npm run dev) sobe o Vite sozinho
  ok "container app no ar"
  if http_alive "$DEV_URL"; then
    ok "dev server já responde em :3000"
  else
    printf '  aguardando o Vite subir'
    local waited=0
    until http_alive "$DEV_URL"; do
      printf '.'; sleep 2; waited=$((waited + 2))
      [ "$waited" -ge 90 ] && { echo; die "timeout no dev server. Log: docker compose logs app"; }
    done
    echo; ok "dev server pronto"
  fi

  cat <<EOF

$(printf '\033[1;32m✓ Ambiente pronto.\033[0m')

  App .......... $DEV_URL   (login: $TEST_EMAIL / $TEST_PASS)
  Perfil ....... "Aluno Teste (verify)" (tea_abstracao, tea_comunicacao_social)
  Supabase ..... http://127.0.0.1:54321   ·   Postgres: $PG_URL
  Functions .... log em $FN_LOG

  Dirija a UI com Chrome DevTools (evaluate_script) — ver skill validate-adaptar.
  Para um JWT pro smoke da edge function:
    curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \\
      -H "apikey: <anon>" -H "Content-Type: application/json" \\
      -d '{"email":"$TEST_EMAIL","password":"$TEST_PASS"}'

  Encerrar:  make verify-adaptar-down   (mantém o Supabase; use make sb-stop pra derrubar)
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
down() {
  say "Encerrando verify-adaptar"

  if [ -f "$FN_PID" ]; then
    kill "$(cat "$FN_PID")" 2>/dev/null && ok "functions serve encerrado" || warn "functions serve já não estava rodando"
    rm -f "$FN_PID"
  else
    pkill -f 'supabase functions serve' 2>/dev/null && ok "functions serve encerrado (via pkill)" || warn "nenhum functions serve rodando"
  fi

  if docker compose ps --status running --services 2>/dev/null | grep -qx app; then
    # O dev server É o CMD do container (`npm run dev`); parar o container o encerra.
    docker compose stop app >/dev/null 2>&1 \
      && ok "container app parado (dev server encerrado)" \
      || warn "não consegui parar o container app"
  else
    warn "container app já não estava rodando"
  fi

  rm -f .env.local && ok ".env.local removido (sem ele, o app aponta pro remoto)"
  warn "Supabase local segue no ar — use 'make sb-stop' pra derrubar."
}

case "${1:-up}" in
  up)   up ;;
  down) down ;;
  *)    die "uso: $0 [up|down]" ;;
esac
