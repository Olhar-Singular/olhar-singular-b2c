# Preencher após criar o projeto Supabase remoto do B2C:
# supabase login → supabase link --project-ref <ref> → atualizar aqui.
PROJECT_ID :=
DC         := docker compose
EXEC       := $(DC) exec app

# ─────────────────────────────────────────────
#  HELP
# ─────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  Orientador Digital B2C — Dev Environment"
	@echo ""
	@echo "  Docker (container do app)"
	@echo "    make up                 Subir container (build + start)"
	@echo "    make down               Parar e remover container"
	@echo "    make rebuild            Rebuild do container (após mudar deps)"
	@echo "    make shell              Shell dentro do container"
	@echo "    make logs               Logs do container app"
	@echo ""
	@echo "  Dev (roda dentro do container)"
	@echo "    make dev                Dev server (Vite, porta 8080)"
	@echo "    make build              Build produção"
	@echo "    make lint               ESLint"
	@echo "    make test               Vitest (single run)"
	@echo "    make test-watch         Vitest (watch mode)"
	@echo "    make typecheck          TypeScript check"
	@echo ""
	@echo "  Supabase Local (roda no host via CLI)"
	@echo "    make sb-start           Subir Supabase local (todos os serviços)"
	@echo "    make sb-stop            Parar Supabase local"
	@echo "    make sb-status          Exibir URLs e keys do Supabase local"
	@echo "    make sb-reset           Resetar banco local (reaplica migrations)"
	@echo ""
	@echo "  Supabase — Setup Remoto"
	@echo "    make sb-login           Autenticar no Supabase"
	@echo "    make sb-link            Vincular CLI ao projeto remoto"
	@echo ""
	@echo "  Banco de dados (migrations)"
	@echo "    make db-push            Aplicar migrations pendentes no remoto"
	@echo "    make db-pull            Baixar schema remoto como migration"
	@echo "    make db-diff            Ver diff entre local e remoto"
	@echo "    make db-new name=<nome> Criar nova migration"
	@echo "    make db-seed-test-user  Criar usuário de teste no DB local"
	@echo ""
	@echo "  Edge Functions"
	@echo "    make fn-deploy-all      Deploy de todas as edge functions"
	@echo "    make fn-deploy fn=<nome> Deploy de uma função específica"
	@echo "    make fn-list            Listar funções deployadas"
	@echo "    make fn-serve           Servir funções localmente (dev)"
	@echo "    make fn-new fn=<nome>   Criar nova edge function"
	@echo ""
	@echo "  Tipos TypeScript"
	@echo "    make gen-types          Gerar tipos do schema local"
	@echo "    make gen-types-remote   Gerar tipos do schema remoto"
	@echo ""
	@echo "  Atalhos"
	@echo "    make start              Subir tudo (Supabase + app)"
	@echo "    make stop               Parar tudo (app + Supabase)"
	@echo "    make sync               db-push + fn-deploy-all + gen-types-remote"
	@echo ""

# ─────────────────────────────────────────────
#  DOCKER
# ─────────────────────────────────────────────
.PHONY: up
up:
	$(DC) up -d --build

.PHONY: down
down:
	$(DC) down

.PHONY: rebuild
rebuild:
	$(DC) build --no-cache
	$(DC) up -d

.PHONY: shell
shell:
	$(EXEC) bash

.PHONY: logs
logs:
	$(DC) logs -f app

# ─────────────────────────────────────────────
#  DEV (dentro do container)
# ─────────────────────────────────────────────
.PHONY: dev
dev:
	$(EXEC) npm run dev

.PHONY: build
build:
	$(EXEC) npm run build

.PHONY: lint
lint:
	$(EXEC) npm run lint

.PHONY: test
test:
	$(EXEC) npm run test

.PHONY: test-watch
test-watch:
	$(EXEC) npm run test:watch

.PHONY: typecheck
typecheck:
	$(EXEC) npm run typecheck

# ─────────────────────────────────────────────
#  SUPABASE — LOCAL (roda no host)
# ─────────────────────────────────────────────
.PHONY: sb-start
sb-start:
	supabase start

.PHONY: sb-stop
sb-stop:
	supabase stop

.PHONY: sb-status
sb-status:
	supabase status

.PHONY: sb-reset
sb-reset:
	supabase db reset

# ─────────────────────────────────────────────
#  SUPABASE — SETUP REMOTO
# ─────────────────────────────────────────────
.PHONY: sb-login
sb-login:
	supabase login

.PHONY: sb-link
sb-link:
	@test -n "$(PROJECT_ID)" || (echo "Preencha PROJECT_ID no topo do Makefile." && exit 1)
	supabase link --project-ref $(PROJECT_ID)

# ─────────────────────────────────────────────
#  BANCO DE DADOS
# ─────────────────────────────────────────────
.PHONY: db-push
db-push:
	supabase db push

.PHONY: db-pull
db-pull:
	supabase db pull

.PHONY: db-diff
db-diff:
	supabase db diff --use-migra

.PHONY: db-new
db-new:
	@test -n "$(name)" || (echo "Uso: make db-new name=<nome_da_migration>" && exit 1)
	supabase migration new $(name)

.PHONY: db-seed-test-user
db-seed-test-user:
	@command -v psql >/dev/null 2>&1 || (echo "psql não encontrado. Instale o postgresql-client." && exit 1)
	@supabase status >/dev/null 2>&1 || (echo "Supabase local não está rodando. Execute: make sb-start" && exit 1)
	@PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
		-v ON_ERROR_STOP=1 \
		-f supabase/scripts/seed_test_user.sql

# ─────────────────────────────────────────────
#  EDGE FUNCTIONS
# ─────────────────────────────────────────────
FUNCTIONS :=

.PHONY: fn-deploy-all
fn-deploy-all:
	@test -n "$(PROJECT_ID)" || (echo "Preencha PROJECT_ID no topo do Makefile." && exit 1)
	@for fn in $(FUNCTIONS); do \
		echo "→ Deploying $$fn..."; \
		supabase functions deploy $$fn --project-ref $(PROJECT_ID); \
	done
	@echo "✓ Todas as funções deployadas."

.PHONY: fn-deploy
fn-deploy:
	@test -n "$(fn)" || (echo "Uso: make fn-deploy fn=<nome_da_função>" && exit 1)
	supabase functions deploy $(fn) --project-ref $(PROJECT_ID)

.PHONY: fn-list
fn-list:
	supabase functions list --project-ref $(PROJECT_ID)

.PHONY: fn-serve
fn-serve:
	supabase functions serve --env-file .env

.PHONY: fn-new
fn-new:
	@test -n "$(fn)" || (echo "Uso: make fn-new fn=<nome_da_função>" && exit 1)
	supabase functions new $(fn)

# ─────────────────────────────────────────────
#  TIPOS TYPESCRIPT
# ─────────────────────────────────────────────
.PHONY: gen-types
gen-types:
	supabase gen types typescript --local \
		> src/integrations/supabase/types.ts
	@echo "✓ Tipos gerados do schema local"

.PHONY: gen-types-remote
gen-types-remote:
	@test -n "$(PROJECT_ID)" || (echo "Preencha PROJECT_ID no topo do Makefile." && exit 1)
	supabase gen types typescript --project-id $(PROJECT_ID) \
		> src/integrations/supabase/types.ts
	@echo "✓ Tipos gerados do schema remoto"

# ─────────────────────────────────────────────
#  ATALHOS
# ─────────────────────────────────────────────
.PHONY: start
start: sb-start up
	@echo "✓ Supabase local + app container rodando."

.PHONY: stop
stop: down sb-stop
	@echo "✓ Tudo parado."

.PHONY: sync
sync: db-push fn-deploy-all gen-types-remote
	@echo "✓ Sync completo: migrations + functions + types."
