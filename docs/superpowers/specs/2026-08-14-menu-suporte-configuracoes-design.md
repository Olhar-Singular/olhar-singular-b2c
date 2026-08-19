# Menu de Suporte + Configurações da Conta — Design

**Data:** 2026-08-14 · **Status:** aprovado (conversa) · **Escopo:** shell autenticado (`Layout.tsx`) + tema

## Objetivo

Hoje o shell autenticado (`src/components/common/Layout.tsx`) não tem nenhum menu de
usuário — só um botão "Sair" solto na sidebar (desktop) e replicado no drawer
(mobile). Não existe página de Configurações/Conta, não existe nenhum e-mail ou
caminho de contato/suporte em lugar nenhum do app, e o tema escuro **não funciona**:
o Tailwind já está configurado (`darkMode: ["class"]`) e o CSS já tem um bloco
`.dark` completo (scaffold padrão do shadcn) em `src/index.css`, mas nenhum
`ThemeProvider` do `next-themes` (já é dependência) está montado em lugar nenhum —
o toggle não teria efeito algum hoje.

Criar um menu único de suporte/configurações com:
- **Suporte**: e-mail da empresa + caminho direto de contato
- **Configurações da conta**: atalho pra comprar créditos + troca de tema claro/escuro
- Tema claro continua sendo o padrão; o escuro precisa ser **bem leve**, porque não
  pode interferir na hora do professor editar as cores de uma prova.

## Decisões (com o usuário)

- **E-mail de suporte:** `contato@olharsingular.com`.
- **Caminho de contato:** `mailto:` direto — um clique abre o cliente de e-mail do
  usuário já endereçado. Sem formulário/backend novo nessa versão.
- **Onde entra:** um único menu (dropdown), não itens soltos na sidebar — hoje não
  existe nenhum menu de usuário, então isso centraliza Configurações + Suporte + Sair.
- **Configurações da conta:** os 2 controles (link pra créditos + switch de tema)
  ficam **dentro do próprio dropdown** — não precisa de painel/rota nova pra isso.

## Achado importante de viabilidade

A superfície da "folha A4" no passo Revisar (`src/components/adaptation/PageSheet.tsx`)
**já usa um namespace de tokens CSS totalmente isolado** (`--sf-*` / `surface-*`),
separado dos tokens de tema do shadcn (`--background`, `--foreground` etc.). O
comentário no próprio `index.css` já deixa explícito: *"Surface is paper-metaphor
LIGHT-ONLY... intentionally no `.dark` overrides."* Ou seja: a folha (mesa + papel +
tinta) **já é imune** a qualquer tema escuro que a gente ligar — ela não referencia
`--background`/`--foreground` em nenhum lugar. As cores de texto/marca-texto
disponíveis no editor (`src/lib/adaptation/canonical/colors.ts` —
`TEXT_COLORS`/`HIGHLIGHT_COLORS`) também são hex fixos, sem nenhuma ligação com
variável de tema.

**Conclusão prática: não precisamos criar nenhuma proteção nova para o editor — só
precisamos ter o cuidado de NÃO adicionar overrides `.dark` para `--sf-*` nem tocar
em `colors.ts`.** O trabalho real da feature é (1) ligar o tema escuro que hoje é só
scaffold morto, e (2) deixá-lo "leve" o suficiente pro chrome do app em volta da folha.

## Design

### 1. Menu — `src/components/common/UserAccountMenu.tsx` (novo)

Um `DropdownMenu` (shadcn, já instalado em `src/components/ui/dropdown-menu.tsx`),
disparado por um botão com as iniciais do usuário (`profile?.full_name` ou fallback
pro ícone `User` do lucide-react, já usado no resto do Layout). Conteúdo:

```
[email do usuário, useAuth().user?.email]
──────────────────────────
Configurações da conta
  • Comprar créditos        → <Link to="/creditos">  (reaproveita CreditsPage, sem UI nova de compra)
  • Tema escuro   [Switch]  → useTheme() do next-themes
──────────────────────────
Suporte
  contato@olharsingular.com
  • Entrar em contato       → <a href="mailto:contato@olharsingular.com">
──────────────────────────
Sair                        → useAuth().signOut()  (mesmo comportamento de hoje)
```

Esse componente substitui o botão "Sair" solto que existe hoje **nos dois lugares**
de `Layout.tsx` (bloco desktop ~linhas 104-113, bloco mobile ~linhas 183-190) — bônus:
remove a duplicação de JSX que já existe entre os dois blocos.

E-mail de suporte vira uma constante única (`SUPPORT_EMAIL`, em
`src/lib/constants.ts` ou arquivo de constantes equivalente já existente) —
fonte única de verdade, não string solta dentro do componente.

### 2. Ligar o tema — `next-themes`

- Montar `<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="olhar-singular-theme">`
  em `src/main.tsx` (envolvendo a árvore da aplicação).
- `enableSystem={false}` é proposital: o pedido foi claro que o tema claro **é** o
  padrão — não deixar a preferência de SO do usuário virar pro escuro sozinha no
  primeiro acesso.
- `next-themes` já persiste a escolha em `localStorage` sozinho.
- Efeito colateral bom: `src/components/ui/sonner.tsx` já chama `useTheme()` (hoje é
  um no-op silencioso porque não há provider) — os toasts passam a respeitar o tema
  de graça, sem mexer nesse arquivo.

### 3. Suavizar a paleta escura — `src/index.css`

O bloco `.dark` que já existe (linhas ~146-166) é o scaffold padrão do shadcn —
contraste "normal" de dark mode (`--background` pula de 96% de luminosidade pra 8%,
ou seja, quase preto). Isso **não** é "bem leve" como pedido. Precisa suavizar,
mantendo os mesmos matizes de marca (195 teal / 40 dourado) mas com um salto de
luminosidade bem mais curto — um cinza-chumbo suave em vez de quase-preto, texto sem
branco estourado, cards com uma leve elevação em relação ao fundo. Ajuste fino é
visual (abrir `make dev` nos dois temas e calibrar no olho), não só numérico —
mantendo contraste AA pra leitura.

**Não tocar:** `--sf-*` (mesa/papel/tinta da folha) e
`src/lib/adaptation/canonical/colors.ts` — ver seção "achado importante" acima.
Conferir visualmente os pontos que usam `hsl(var(--primary))`/`hsl(var(--muted-foreground))`
dentro do chrome do editor (`index.css` linhas ~236-390 — rótulo de tipo de bloco,
anel de seleção, contorno de imagem) — esses SÃO afetados pelo tema (mudam de leve),
o que é esperado por serem elementos de chrome, não da folha em si.

## Arquivos

**Novos:**
- `src/components/common/UserAccountMenu.tsx` (+ `.test.tsx`)
- Constante `SUPPORT_EMAIL` (novo arquivo `src/lib/constants.ts`, ou dentro de um
  arquivo de constantes equivalente já existente — confirmar durante a implementação)

**Modificados:**
- `src/components/common/Layout.tsx` — troca os 2 blocos de botão "Sair" por
  `<UserAccountMenu />`
- `src/main.tsx` — monta `ThemeProvider` do `next-themes`
- `src/index.css` — suaviza o bloco `.dark`

**Reaproveitado sem alteração:** `dropdown-menu.tsx`/`switch.tsx` (shadcn),
`useAuth()` (email + `signOut`), rota `/creditos` (`CreditsPage.tsx`, só link,
sem UI de compra nova), tokens `--sf-*`, `canonical/colors.ts`.

## Riscos / pontos em aberto

- Suavizar a paleta escura é trabalho visual/iterativo, não um valor numérico único
  cravado de antemão — prever uma passada de calibração no browser.
- Tirar o "Sair" solto e colocar dentro do dropdown torna esse atalho "um clique a
  mais" — é o padrão comum de menus de conta, mas vale registrar como troca de UX.

## Verificação

- Vitest: testes novos do `UserAccountMenu` (mostra o e-mail certo, `mailto:` com
  href correto, link de créditos aponta pra `/creditos`, switch de tema alterna e
  reflete o estado do `next-themes`) — gate de cobertura 100% mantido.
- Manual (`make dev`): alternar tema e conferir (a) chrome do app muda pra paleta
  escura suave, (b) a folha A4 do Revisar continua branca/clara independente do
  tema, (c) escolha persiste depois de recarregar a página, (d) `mailto:` abre o
  cliente de e-mail padrão endereçado a `contato@olharsingular.com`, (e) "Comprar
  créditos" navega pra `/creditos`.
- Sem mudança de schema/RPC — nada novo pra pgTAP.
