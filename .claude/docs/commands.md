# Comandos `make` — referência completa

O `Makefile` na raiz é a fonte de verdade. `CLAUDE.md` lista só os comandos do dia a dia.

## Docker (container do app)

```bash
make up                  # Subir container (build + start)
make down                # Parar container
make rebuild             # Rebuild após mudar dependências
make shell               # Shell dentro do container
make logs                # Logs do container
```

## Dev (rodam dentro do container via make)

```bash
make dev                 # Dev server (Vite, porta 8080)
make build               # Build produção
make lint                # ESLint
make test                # Vitest (single run)
make test-watch          # Vitest (watch mode)
make typecheck           # TypeScript check
```

## Supabase

```bash
make sb-start            # Subir Supabase local
make sb-stop             # Parar Supabase local
make sb-status           # Exibir URLs e keys locais
make sb-reset            # Reset DB local (reaplica migrations)
make sb-login            # Autenticar no Supabase (remoto)
make sb-link             # Vincular ao projeto remoto (requer PROJECT_ID no Makefile)
make db-push             # Aplicar migrations no remoto
make gen-types           # Gerar tipos TypeScript do schema local
make gen-types-remote    # Gerar tipos do schema remoto
make fn-deploy-all       # Deploy de todas as edge functions
make fn-serve            # Servir funções localmente
make test-db             # pgTAP (RPC/RLS) — exige Docker
```

## Atalhos

```bash
make start               # Subir tudo (Supabase local + container app)
make stop                # Parar tudo
```
