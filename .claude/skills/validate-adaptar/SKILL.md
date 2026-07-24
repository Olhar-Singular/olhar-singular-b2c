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
# O browser (no host) lê essas vars do bundle e chama o Supabase em 127.0.0.1 direto.
ANON=$(supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d= -f2- | tr -d '"')  # ou pegue de `supabase status`
cat > .env.local <<EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON
VITE_SUPABASE_PROJECT_ID=local
EOF
# O dev server roda DENTRO do container app: o CMD do container JÁ É `npm run dev` (o Vite
# escuta 8080 no container → docker-compose mapeia pra localhost:3000 no HOST). Ou seja,
# `docker compose up -d` sozinho já sobe o Vite — NÃO rode um segundo (conflita no 8080).
# `npm run dev` no host falha (node_modules mora no volume do container).
docker compose up -d                # sobe o container; o CMD inicia o Vite sozinho
#   logs do dev:  docker compose logs -f app   ·   acesse SEMPRE http://localhost:3000
```

> Atalho: `make verify-adaptar` faz todo este setup (Supabase + reset + seed + `.env.local` +
> functions serve + dev no container) de uma vez, e deixa tudo pronto em http://localhost:3000.
> Este passo-a-passo manual fica como referência / para depurar quando o atalho falha.

> Conexão Postgres direta (verificações/seed): `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`.
> zsh NÃO faz word-split de variável — chame `psql`/`curl` direto, não via `$VAR` com flags.
> Nunca use `UID` como nome de variável no zsh (é reservado → "bad math expression").

## Seed de dados (pra alcançar o fluxo sem setup manual)

O usuário ganha créditos por trigger ao ser criado. O passo Barreiras **exige um perfil de
barreira COM ao menos uma barreira** (perfil vazio trava o wizard — ver abaixo).

**Caminho rápido (recomendado):** `make verify-adaptar` roda o seed SQL idempotente
(`supabase/scripts/seed_test_user.sql` + `seed_verify_adaptar.sql`) que insere um usuário
**já confirmado** (`teste@teste.com` / `123123`, com créditos) e um perfil de barreira com
barreiras reais — direto no banco, **sem passar por signup/confirmação**. Use isto a menos
que você queira exercitar o fluxo de auth de verdade.

**Caminho manual (exercita o signup real):** o Supabase local tem `enable_confirmations = true`
(`supabase/config.toml`), então o signup **NÃO** retorna sessão e o login falha com
`email not confirmed` até você confirmar o e-mail no banco.

```bash
ANON=<anon key local>; EMAIL=flow@local.dev; PASS='Test123456!'
# 1) signup (não retorna sessão enquanto o e-mail não for confirmado)
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
# 2) CONFIRMAR o e-mail no banco (senão o login abaixo falha)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "update auth.users set email_confirmed_at = now() where email='flow@local.dev';"
# 3) login → pega o JWT + user.id
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
#    → guarde access_token (JWT) e user.id
# 4) perfil de barreira COM barreiras. barriers é text[] com as CHAVES PLANAS do catálogo
#    BARRIER_DIMENSIONS (src/lib/domain/barriers.ts) — ex.: tea_abstracao. NÃO use '{}':
#    perfil vazio TRAVA o passo Barreiras ("O perfil selecionado não possui barreiras").
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "insert into public.barrier_profiles (user_id,name,barriers,observation)
   values ('<UID>','Aluno Teste',array['tea_abstracao','tea_comunicacao_social'],'obs');"
```

> **TanStack Query cacheia a lista de perfis** (`useBarrierProfiles`). Se você inserir/alterar
> um perfil com a página Adaptar já aberta, o `<select>` só reflete a mudança após **recarregar
> a página** (ou invalidar a query). Seed **antes** de abrir a página, ou dê reload depois.

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
// abrir: new_page http://localhost:3000 ; depois navigate_page para /auth?signup=1, /adaptar, etc.
// (host = 3000; o Vite escuta 8080 SÓ dentro do container — ver Setup.)

// clicar botão por texto exato (visível) — o rótulo do avanço muda por passo:
// "Próximo" na Atividade, "Adaptar" no passo Barreiras.
const T = e => (e.innerText||'').replace(/\n/g,' ').trim();
const vis = e => e.offsetParent !== null;
[...document.querySelectorAll('button')].filter(vis).find(b => T(b)==='Adaptar')?.click();

// preencher input/textarea CONTROLADO por React (precisa do setter nativo + evento)
const ta = document.querySelector('textarea');
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,'texto');
ta.dispatchEvent(new Event('input',{bubbles:true}));

// <select> NATIVO (o seletor de perfil é nativo; o seletor de fonte no popover Formato também):
const s=document.querySelector('select'); const o=[...s.options].find(x=>x.textContent.includes('Aluno Teste'));
Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);
s.dispatchEvent(new Event('change',{bubbles:true}));

// Passo Barreiras: NÃO há checkboxes nem botão "Editar". Selecionar o perfil no <select> já
// preenche as barreiras (mostradas como tags read-only); depois clique "Adaptar" pra avançar.

// esperar geração da IA: poll até o spinner sumir
while (document.querySelector('[class*="animate-spin"]') && waited<60000){ await new Promise(r=>setTimeout(r,2500)); waited+=2500; }
```

**SEMPRE após uma ação de UI, cheque o console** — error boundaries ("Ops, algo não saiu como esperado") escondem o erro visualmente, mas o stack está lá:
```
list_console_messages({ types:["error"] })
```
Foi assim que o crash do editor (`node.type.spec.toDOM is not a function`) foi diagnosticado.

### Sequência do happy-path do Adaptar
1 Tipo (clicar "Prova") → 2 Atividade (preencher textarea, "Próximo") → 3 Barreiras (selecionar perfil no `<select>`; as barreiras do perfil aparecem como tags read-only; clicar **"Adaptar"**) → 4 **Gerar** (auto-dispara a IA; aguardar) → 5 **Revisar** (superfície única: `.ProseMirror` deve renderizar na folha; edição inline + card da questão + popover **"Formato"** + "Sobre esta adaptação"; **checar console**) → 6 Exportar (Salvar). Indicador "Salvo" = autosave gravou o draft.

> O wizard tem **um só passo de edição** ("Revisar") — os antigos Conteúdo + Estilo foram fundidos. Não existe mais passo "Estilo".

## Verificar no banco (persistência real)

```sql
-- draft/adaptação salva, com o documento canônico. A linha nasce no SERVIDOR:
-- toda geração 200 já deixa um draft aqui, mesmo que o browser morra em seguida.
select status, activity_type, request_id, credits_spent,
       jsonb_array_length(adaptation_result->'document'->'blocks') as blocks
from public.adaptations where user_id='<UID>';
-- prova do A7 sem UI nenhuma: POST na edge function e confira que a linha existe
-- (o `request_id` da resposta é o mesmo da reserva; replay dá 409 e NÃO duplica).
-- round-trip lossless: um campo fundo sobrevive (math inline, gabarito)
select adaptation_result->'document'->'blocks'->1->'answer'->'alternatives'->0->>'correct'
from public.adaptations where user_id='<UID>' limit 1;
-- crédito (coluna é credit_balance, NÃO 'credits')
select credit_balance, free_adaptation_used from public.profiles where id='<UID>';
-- reserva de crédito: TODA geração deixa uma linha. 'settled' = entregou e cobrou;
-- 'reversed' = falhou e devolveu; 'open' parada = o isolate morreu (o job reverte).
select id, state, credits_charged, free_claimed from public.credit_reservations
 where user_id='<UID>' order by created_at desc;
```

## Gotchas confirmados nesta base

- **Tiptap**: todo nó custom precisa de `renderHTML` (+ `parseHTML`); attrs-objeto (`style`,`answer`,`items`,`caption`,`instruction`) com `rendered:false`. Sem isso o editor crasha ao montar. Teste de regressão: serializar o schema real (`DOMSerializer.fromSchema` + `serializeFragment`).
- **Edge function importando `src/`**: imports relativos do pacote precisam de **`.ts`** (Deno); `deno.json` import map cobre `zod`/`zod-to-json-schema`.
- **Runtime keyless do `supabase start`**: o edge-runtime que sobe junto com `supabase start` serve as functions **sem** ler o `.env` raiz → `adapt-activity` responde **HTTP 500 `No AI provider configured`**. Pra geração real você **precisa** rodar `supabase functions serve --env-file .env` (injeta `AI_API_KEY`), que substitui o runtime keyless. O `make verify-adaptar` já sobe esse serve com a chave.
- **Persistência**: a tabela `adaptations` tem `original_activity/activity_type/barriers_used/adaptation_result/status/observation_notes` (migration `20260604000000`) + `request_id` (migration `20260723160000`). Coluna de saldo = `credit_balance`. `content` (antiga) foi dropada. **Quem insere é a edge function**, antes do `settle` da reserva — o cliente só dá `update`.
- **Autosave/draft: 5 armadilhas que o Vitest NÃO pega** (todas confirmadas no browser; a suíte
  passava verde com cada uma delas). Ao mexer no ciclo de vida do rascunho, exercite **estes**
  roteiros na UI real, não só os testes:
  1. **"Nova adaptação" → gerar de novo** → tem que autosalvar ("Salvo") sem conflito. O token
     `expectedUpdatedAt` é por linha; herdar o da adaptação anterior dá conflito → `navigate(0)`.
  2. **Salvar → continuar editando** → sem conflito. `markReady` bumpa o `updated_at`; o wizard
     precisa adotá-lo (`syncUpdatedAt`).
  3. **Digitar e sair dentro do debounce (~1200ms)** → o flush de `blur`/`visibilitychange` tem que
     gravar. E um flush que **falha** não pode virar "Salvo" nem marcar a linha ready.
  4. **Recuperar mirror** → a folha tem que **mudar de verdade**. Dois bugs moravam aqui: o editor
     semeava o conteúdo uma única vez (a folha ficava com o doc antigo), e o prompt sequer aparecia
     porque `<StrictMode>` monta o efeito duas vezes e o latch fechava antes do await. **Teste isto
     no browser** — em jsdom, sem StrictMode, os dois passam despercebidos.
  5. **Reabrir em modo edição e alt-tab** → o passo/cursor tem que ficar onde estava. Key derivada
     do `updated_at` + refetch no focus remontava o wizard a cada autosave.
  > Para plantar um mirror divergente à mão (roteiro 4), escreva em `indexedDB` no store
  > `adaptation-drafts/drafts` uma entry `{ draftId, result, savedAt }` com o `result` da linha
  > alterado — pode usar `savedAt` **antigo**: a decisão é por conteúdo, não por timestamp.
- **Gatilhos de "autosave congelado" (B8) — roteiro de regressão no browser.** Nenhum destes é
  pego por Vitest+jsdom sozinho; todos foram confirmados no editor real. Ao mexer no schema
  Tiptap, nos mappers ou nos NodeViews, refaça **estes** quatro:
  1. **Shift+Enter** no meio de um parágrafo → tem que virar **parágrafo novo** (não `hardBreak`),
     autosave "Salvo", e o **reload** não pode abrir folha em branco.
  2. **Copiar/colar uma questão** → a cópia mantém `answer`/`instruction` e ganha **id novo**.
     Confira no banco, não só na tela (o `answer` é attr, não aparece no texto).
  3. **Colar do Word** (`<span style="color:#ff0000; font-size:12pt">`) → grava `color` do
     allowlist (`#DC2626`) e `fontSize: 12` (não 9).
  4. **Inserir Imagem pelo "+"** sem escolher arquivo → doc continua salvando (src placeholder).
  > Para dirigir o editor real sem passar pelo wizard inteiro: semeie uma linha em `adaptations`
  > com um documento canônico e abra **`/adaptar/editar/:id`** (a rota é essa, não `/adaptacoes/...`).
  > O `EditorView` é alcançável por `document.querySelector('.ProseMirror').editor` — dá pra usar
  > `editor.commands.setNodeSelection(pos)` + `ClipboardEvent` pra exercitar o clipboard REAL
  > (um `copy` sintético sem NodeSelection não aciona o serializador e volta vazio).
- **Prova de que o congelamento é visível**: force `src:""` num nó de imagem via
  `view.dispatch(view.state.tr.setNodeAttribute(pos,'src',''))` → o status tem que virar
  **"Alterações não estão sendo salvas"** (`[data-testid="capture-failure"]`, com o motivo no
  `title`) e sair um `console.warn` `[canonical-editor] edição não capturada`. Desfazer limpa.
- **Barreiras vêm do perfil (read-only)**: no passo Barreiras **não há** edição de barreiras nem botão "Editar" — o `<select>` nativo de perfil já preenche as barreiras (tags read-only) e o avanço é o botão **"Adaptar"**. Perfil com `barriers='{}'` trava o passo ("não possui barreiras"); seed com chaves reais do catálogo. No **Revisar**, o popover de aparência abre pelo botão **"Formato"** e o seletor de fonte é `<select>` nativo (opção "Padrão" + optgroups).

## Cleanup

Se subiu via `make verify-adaptar`, rode **`make verify-adaptar-down`** (faz tudo isto). Manual:

```bash
rm -f .env.local                                    # sem ele, o app aponta pro remoto
pkill -f 'supabase functions serve' 2>/dev/null     # functions serve (roda no host)
docker compose stop app                             # dev server = CMD do container → parar o container o encerra
# supabase db reset                                 # opcional: limpa usuários/perfis de teste
# supabase stop                                     # opcional: derruba o stack local
```

## Roadmap (ver o plano completo)
`docs/superpowers/plans/2026-06-04-e2e-and-autonomous-testing.md`.

**Já existe:** `make verify-adaptar` — automatiza o §Setup + §Seed (Supabase + `db reset` +
usuário confirmado + perfil com barreiras reais + `.env.local` efêmero + functions serve + dev
no container), deixando tudo pronto em http://localhost:3000. `make verify-adaptar-down` derruba
o dev/functions e remove o `.env.local`. **Use o atalho**; o passo-a-passo acima fica pra
depurar quando ele falha. (Orquestração: `supabase/scripts/verify-adaptar.sh`.)

**Já existe (Fase 1, no gate Vitest):**
- `src/components/adaptation/canonical-editor/CanonicalEditor.realdom.test.tsx` — monta o editor
  Tiptap **de verdade** (sem mock) e afirma que renderiza; pega o crash de render (`toDOM`).
- `CanonicalAdaptationWizard.test.tsx` tem um caso que renderiza dentro de **`<StrictMode>`**
  (efeitos montados duas vezes) — foi o que travou o bug do prompt de recuperação que nunca
  aparecia. Ao mexer em efeito com `await` + latch/ref, replique esse padrão.
- `supabase/functions/denoImportGraph.test.ts` — **lint estático** do grafo de imports: a partir
  de cada `index.ts` de function, segue os imports e exige extensão `.ts` explícita + zero `@/`.
  ⚠️ **`supabase functions serve` NÃO pega esse bug** (o compile via esbuild resolve import sem
  extensão e ainda cacheia o bundle) — por isso o check é um lint do grafo, não um smoke de runtime.

**Ainda pendente:** `data-testid` nos âncoras e o Playwright E2E (stub no PR + real no nightly).
Quando existirem, **atualize esta skill** pra apontar pra eles.
