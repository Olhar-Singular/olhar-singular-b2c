# Estrutura de Diretórios

Árvore completa. As anotações não-óbvias (frágil, gerado, compartilhado c/ Deno) estão
resumidas em `CLAUDE.md` → seção Estrutura.

```
src/
├── components/
│   ├── ui/              # shadcn/ui — NÃO EDITAR manualmente
│   ├── adaptation/      # editor Tiptap, render e export (PDF em render/pdf/ — ÁREA FRÁGIL)
│   ├── forms/ dialogs/  # formulários e modais de domínio
├── pages/               # uma página por rota (AdaptarPage, ChatPage, CreditsPage, …)
├── hooks/               # use* — server-state via TanStack Query sobre Supabase
├── contexts/            # auth context
├── lib/
│   ├── adaptation/      # documento canônico + schema Tiptap (compartilhado c/ edge fn Deno)
│   ├── domain/          # parsers e tipos (questionParser, QuestionType, SUBJECTS)
│   ├── tiptap/ utils/   # extensões Tiptap e utilitários
│   └── utils.ts         # cn()
├── integrations/
│   └── supabase/        # client + types.ts (gerado — NÃO EDITAR)
├── App.tsx              # Router + providers
└── main.tsx             # Entry point

supabase/
├── functions/           # 10 edge functions + _shared/; lógica testável em _shared/, glue em index.ts
├── migrations/          # schema + RPCs de crédito + RLS
└── tests/database/      # pgTAP (RPC/RLS)
```

> Mapa de domínio (qual fluxo usa qual página/hook/edge function, onde mora cada camada de
> lógica, gotchas de dados): skill `dominio-orientador`.
