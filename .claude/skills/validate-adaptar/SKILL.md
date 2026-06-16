---
name: validate-adaptar
description: >-
  Use ao validar o fluxo "Adaptar" (ou qualquer fluxo de UI) de ponta a ponta contra o
  ambiente REAL — não só os testes unitários. Triggers: "validar o fluxo", "testar no
  browser", "rodar o fluxo completo", "subir o Docker e testar", "o editor/geração/save
  funciona de verdade?", validar uma edge function (bundling Deno), confirmar persistência
  no banco, ou diagnosticar um error boundary. Cobre a estratégia em camadas: testes →
  banco (migration/pgTAP/round-trip) → edge function (bundle Deno) → IA real (Gemini) →
  UI no browser via Chrome DevTools. Existe porque cobertura unitária 100% NÃO pega bugs
  de integração (mock de Tiptap esconde crash de render; Vitest não exercita o bundle Deno).
---

# Validar o fluxo "Adaptar" (e dirigir o app) de forma autônoma

Playbook para validar mudanças **contra o ambiente real**, não só `make test`. A reestruturação canônica do Adaptar passou com 1684 testes / 100% cobertura e mesmo assim tinha **2 bugs críticos** que só apareceram rodando de verdade. Este é o procedimento para encontrá-los.

## Por que (a lição-mãe)

**Mock esconde integração.** Os testes de componente mockam `@tiptap/react` → o ProseMirror/DOMSerializer real nunca roda → um nó sem `renderHTML` crasha o editor no browser mas passa verde. E o Vitest roda no Vite → nunca exercita o bundle **Deno** das edge functions → um import sem `.ts` quebra o deploy mas passa verde. **Sempre que mexer em editor/Tiptap, edge function, schema ou persistência: valide no ambiente real seguindo este playbook.**

## Estratégia em camadas (rode na ordem; pare na 1ª falha)

| Camada | Comando | Pega |
|---|---|---|
| 1. Tipos | `npx tsc --noEmit` | erros de tipo |
| 2. Unit/cobertura | `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run --coverage` | lógica + gate 100% |
| 3. Lint | `npx eslint src` | estilo |
| 4. Banco real | `supabase db reset` → `make gen-types` → `make test-db` | migration aplica, RLS (pgTAP), types em dia |
| 5. **Render real** (sem mock) | smoke tipo `src/lib/adaptation/tiptap/domSerialization.test.ts` | `toDOM`/renderHTML faltando (crash do editor) |
| 6. **Bundle Deno** | `supabase functions serve <fn>` + POST smoke | `Module not found` (imports sem `.ts`, deps fora do import map) |
| 7. IA real | POST autenticado na edge function | contrato structured-output do Gemini, créditos |
| 8. UI no browser | Chrome DevTools (ver §Dirigir a UI) | tudo junto, error boundaries |

## Setup do ambiente real

```bash
# Supabase local (idempotente; se já 'up', não re-suba)
supabase status >/dev/null 2>&1 || supabase start
supabase db reset            # aplica TODAS as migrations do zero (valida o SQL)
make gen-types               # regenera src/integrations/supabase/types.ts do schema local
                             # → depois disso, remova casts 'as never'/'as any' que existiam só por types defasados

# Edge functions com a chave de IA real (só AI_API_KEY; runtime injeta SUPABASE_*)
grep '^AI_API_KEY=' .env > /tmp/fn.env
supabase functions serve --env-file /tmp/fn.env > /tmp/fnserve.log 2>&1 &

# App apontando pro LOCAL — use .env.local (Vite prioriza, é gitignored; NÃO edite .env)
ANON=$(supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d= -f2- | tr -d '"')  # ou pegue de `supabase status`
cat > .env.local <<EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON
VITE_SUPABASE_PROJECT_ID=local
EOF
npm run dev > /tmp/dev.log 2>&1 &   # Vite na porta 8080
```

> Conexão Postgres direta (verificações/seed): `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`.
> zsh NÃO faz word-split de variável — chame `psql`/`curl` direto, não via `$VAR` com flags.
> Nunca use `UID` como nome de variável no zsh (é reservado → "bad math expression").

## Seed de dados (pra alcançar o fluxo sem setup manual)

O usuário de signup ganha 50 créditos (trigger). O passo Barreiras **exige um perfil de barreira**.

```bash
ANON=<anon key local>
# 1) criar usuário + pegar JWT
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{"email":"flow@local.dev","password":"Test123456!"}'
#    → guarde access_token (JWT) e user.id
# 2) criar 1 perfil de barreira (senão o passo 3 do wizard trava)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
 "insert into public.barrier_profiles (user_id,name,barriers,observation) values ('<UID>','Aluno Teste','{}','obs');"
```

## Testar a edge function isolada (camadas 6+7)

```bash
JWT=<access_token>; ANON=<anon>
curl -s -X POST "http://127.0.0.1:54321/functions/v1/adapt-activity" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"original_activity":"1) Quanto é 2+2?","activity_type":"prova","barriers":[{"dimension":"tea","barrier_key":"foco"}]}' \
  -w "\nHTTP %{http_code}\n"
```
- **`Module not found` / BOOT_ERROR** no `/tmp/fnserve.log` = bug de bundle Deno (imports de `src/` precisam de extensão **`.ts`** explícita; deps `npm`/bare precisam estar no `supabase/functions/deno.json` import map).
- **HTTP 401** com JWT falso = ok (auth funciona). **200** com `{adaptation:{document:{blocks:[...]}}}` = contrato Gemini ok.
- Crédito: 1ª adaptação é grátis (`free_adaptation_used` flipa, saldo intacto); demais debitam.

## Dirigir a UI (Chrome DevTools) — RÁPIDO, sem `take_snapshot`

`take_snapshot` é lento/caro (despeja a a11y tree). Use **`evaluate_script`**: clique por texto/`data-testid` e leia o estado numa só chamada. Padrões que funcionam:

```js
// abrir: new_page http://localhost:8080 ; depois navigate_page para /auth?signup=1, /adaptar, etc.

// clicar botão por texto exato (visível)
const T = e => (e.innerText||'').replace(/\n/g,' ').trim();
const vis = e => e.offsetParent !== null;
[...document.querySelectorAll('button')].filter(vis).find(b => T(b)==='Próximo')?.click();

// preencher input/textarea CONTROLADO por React (precisa do setter nativo + evento)
const ta = document.querySelector('textarea');
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,'texto');
ta.dispatchEvent(new Event('input',{bubbles:true}));

// <select> NATIVO (o seletor de perfil é nativo, NÃO Radix):
const s=document.querySelector('select'); const o=[...s.options].find(x=>x.textContent.includes('Aluno Teste'));
Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);
s.dispatchEvent(new Event('change',{bubbles:true}));

// checkbox Radix (role="checkbox") → .click(). MAS: ao selecionar um perfil, as barreiras
// ficam TRAVADAS (mostram as do perfil). Clique "Editar" antes de marcar.

// esperar geração da IA: poll até o spinner sumir
while (document.querySelector('[class*="animate-spin"]') && waited<60000){ await new Promise(r=>setTimeout(r,2500)); waited+=2500; }
```

**SEMPRE após uma ação de UI, cheque o console** — error boundaries ("Ops, algo não saiu como esperado") escondem o erro visualmente, mas o stack está lá:
```
list_console_messages({ types:["error"] })
```
Foi assim que o crash do editor (`node.type.spec.toDOM is not a function`) foi diagnosticado.

### Sequência do happy-path do Adaptar
1 Tipo (clicar "Prova") → 2 Atividade (preencher textarea, "Próximo") → 3 Barreiras (selecionar perfil no `<select>`, "Editar", marcar 1 barreira, "Próximo") → 4 **Gerar** (auto-dispara a IA; aguardar) → 5 **Revisar** (superfície única: `.ProseMirror` deve renderizar na folha; edição inline + card da questão + Aparência + "Sobre esta adaptação"; **checar console**) → 6 Exportar (Salvar). Indicador "Salvo" = autosave gravou o draft.

> O wizard tem **um só passo de edição** ("Revisar") — os antigos Conteúdo + Estilo foram fundidos. Não existe mais passo "Estilo".

## Verificar no banco (persistência real)

```sql
-- draft/adaptação salva, com o documento canônico
select status, activity_type, jsonb_array_length(adaptation_result->'document'->'blocks') as blocks
from public.adaptations where user_id='<UID>';
-- round-trip lossless: um campo fundo sobrevive (math inline, gabarito)
select adaptation_result->'document'->'blocks'->1->'answer'->'alternatives'->0->>'correct'
from public.adaptations where user_id='<UID>' limit 1;
-- crédito (coluna é credit_balance, NÃO 'credits')
select credit_balance, free_adaptation_used from public.profiles where id='<UID>';
```

## Gotchas confirmados nesta base

- **Tiptap**: todo nó custom precisa de `renderHTML` (+ `parseHTML`); attrs-objeto (`style`,`answer`,`items`,`caption`,`instruction`) com `rendered:false`. Sem isso o editor crasha ao montar. Teste de regressão: serializar o schema real (`DOMSerializer.fromSchema` + `serializeFragment`).
- **Edge function importando `src/`**: imports relativos do pacote precisam de **`.ts`** (Deno); `deno.json` import map cobre `zod`/`zod-to-json-schema`.
- **Persistência**: a tabela `adaptations` tem `original_activity/activity_type/barriers_used/adaptation_result/status/observation_notes` (migration `20260604000000`). Coluna de saldo = `credit_balance`. `content` (antiga) foi dropada.
- **Perfil trava barreiras** → botão "Editar". **Seletor de perfil é `<select>` nativo**. **Checkbox é Radix.**

## Cleanup

```bash
rm -f .env.local                         # app volta a apontar pro remoto
kill %1 %2 2>/dev/null                    # dev server + functions serve (ou pkill -f 'vite|functions serve')
# supabase db reset                       # opcional: limpa usuários/perfis de teste
# supabase stop                           # opcional: derruba o stack local
```

## Roadmap (ver o plano completo)
`docs/superpowers/plans/2026-06-04-e2e-and-autonomous-testing.md` — Playwright E2E, smoke "real DOM" no CI, `data-testid` nos âncoras, `make verify-adaptar`. Quando esses existirem, **atualize esta skill** para apontar pra eles em vez do procedimento manual.
