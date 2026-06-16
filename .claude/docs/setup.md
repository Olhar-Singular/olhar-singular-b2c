# Setup Inicial

Onboarding único de uma máquina nova. Referenciado por `CLAUDE.md`.

```bash
# 1. Instalar Supabase CLI
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xz -C ~/.local/bin supabase

# 2. Configurar .env (copiar .env.example)
cp .env.example .env

# 3. Subir
make start

# 4. Copiar keys locais do supabase status para o .env
make sb-status
```

Detalhe das variáveis de ambiente: ver `.claude/docs/environment.md`.
