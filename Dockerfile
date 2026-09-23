FROM node:22-slim

# poppler-utils: pdftoppm/pdffonts for the PDF font smoke's ink check
# (scripts/pdf-font-smoke.mjs) — without it the smoke degrades to
# structural-only and cannot catch invisible-glyph font corruption.
RUN apt-get update && apt-get install -y \
    curl unzip git ca-certificates poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Supabase CLI
RUN curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
    | tar -xz -C /usr/local/bin supabase

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Lockfile + `npm ci`: deterministic install (same as CI). A lockless
# `npm install` re-resolves the whole tree on every build and tripped the
# npm 10.9 arborist crash "Cannot read properties of null (reading 'edgesOut')".
COPY package.json package-lock.json bunfig.toml ./
RUN npm ci

EXPOSE 8080

CMD ["npm", "run", "dev"]
