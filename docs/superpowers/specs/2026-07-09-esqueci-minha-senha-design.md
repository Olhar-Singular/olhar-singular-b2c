# Design — Esqueci minha senha

**Data:** 2026-07-09
**Área:** Auth (`AuthPage`, rotas públicas, templates de e-mail do Supabase)
**Status:** desenho aprovado, aguardando revisão do spec

## Problema

Não existe recuperação de senha. Quem esquece a senha perde a conta: a `AuthPage`
só oferece login e cadastro, e o código não usa `resetPasswordForEmail`,
`updateUser` nem trata o evento `PASSWORD_RECOVERY` em lugar nenhum.

## Decisão

Implementar o fluxo padrão de recuperação do Supabase em **duas telas dedicadas**
(`/esqueci-senha` e `/redefinir-senha`), mantendo a `AuthPage` enxuta — ela só
ganha o link de entrada. A tela de redefinição **precisa** de rota própria: é o
destino (`redirectTo`) do link do e-mail.

Decisões de UX aprovadas:

- **Dois campos** na redefinição (senha + confirmar) — rede de segurança contra
  erro de digitação num momento em que o usuário não re-loga tão cedo.
- **Volta pro login** após o sucesso: `signOut()` + `navigate("/auth")`. Não deixa
  a sessão de recovery ativa e confirma que a senha nova funciona.
- **`AuthLayout` compartilhado**: o shell visual (marca + `Card` + rodapé) se
  repetiria em 3 telas; vira componente único.
- **Reenvio com cooldown 60s** na tela de solicitar, em paridade com a view
  "Verifique seu e-mail" do cadastro.

## Fluxo ponta a ponta

```
Login (AuthPage)
  └─ link "Esqueci minha senha?"
       ↓
/esqueci-senha  (ForgotPasswordPage)
  • digita e-mail → "Enviar link de redefinição"
  • supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`
    })
  • SEMPRE a mesma mensagem neutra (anti-enumeração de e-mail),
    exista ou não a conta + botão "Reenviar" (cooldown 60s)
       ↓ (e-mail — template recovery.html)
/redefinir-senha  (ResetPasswordPage)  ← destino do link, com sessão de recovery
  • detecta a sessão de recovery (ver "Detecção da sessão")
  • form: nova senha + confirmar (toggle mostrar/ocultar)
  • valida: ≥ 6 chars, senha === confirmação
  • supabase.auth.updateUser({ password })
  • sucesso → signOut() + toast + navigate("/auth", { replace: true })
```

## Detecção da sessão de recovery

O projeto está no **fluxo implicit**: o `confirmation.html` usa
`{{ .ConfirmationURL }}`, e o client não seta `detectSessionInUrl` — ou seja, usa
o default `true` do `supabase-js`. O `recovery.html` segue o mesmo padrão.

O link do e-mail leva a `/redefinir-senha#access_token=…&type=recovery`; o
`supabase-js` consome o hash, cria a sessão e dispara
`onAuthStateChange("PASSWORD_RECOVERY", session)`.

A `ResetPasswordPage` é uma máquina de 3 estados:

| Estado | Quando | UI |
| ------ | ------ | -- |
| `checking` | inicial | resolve a sessão (ver abaixo) |
| `ready` | há sessão de recovery | form de nova senha |
| `invalid` | não há sessão | "Link inválido ou expirado" + botão "Solicitar novo link" (→ `/esqueci-senha`) |

**Como sair de `checking` sem timeout arbitrário:** `getSession()` já aguarda a
inicialização interna do client — que é onde o hash da URL é consumido. Logo ele é
o decisor: `sessão ⇒ ready`, `null ⇒ invalid`. A assinatura de `onAuthStateChange`
existe só como reforço, para o caso de o evento `PASSWORD_RECOVERY` chegar depois
do mount; ela promove `checking`/`invalid` → `ready`. Nada de `setTimeout`.

O caso `invalid` cobre link expirado, link já usado e acesso direto à URL.

**Nota — a sessão de recovery é uma sessão real.** Ao abrir o link, o
`AuthContext` global recebe a sessão pelo `onAuthStateChange` e passa a tratar o
usuário como autenticado (rotas protegidas ficam acessíveis mesmo sem trocar a
senha). Isso é comportamento nativo do Supabase no fluxo implicit, não um bug
introduzido aqui, e é justamente por isso que o `signOut()` pós-redefinição
importa. Sair da tela sem concluir deixa a sessão viva até expirar — aceito neste
escopo; endurecer isso exigiria PKCE (ver Fora de escopo).

## Arquivos

**Novos**

- `src/components/auth/AuthLayout.tsx` (+ `.test.tsx`) — shell visual compartilhado.
- `src/pages/ForgotPasswordPage.tsx` (+ `.test.tsx`)
- `src/pages/ResetPasswordPage.tsx` (+ `.test.tsx`)
- `supabase/templates/recovery.html` — espelha `confirmation.html` (mesma paleta,
  logo e estrutura de tabela); copy trocada para "Redefinir sua senha", CTA
  "Redefinir senha" e nota "se você não solicitou, ignore este e-mail". Usa o
  mesmo `{{ .ConfirmationURL }}`.

**Modificados**

- `src/App.tsx` — duas rotas **públicas** (`/esqueci-senha`, `/redefinir-senha`),
  fora do `ProtectedRoute`.
- `src/pages/AuthPage.tsx` (+ `.test.tsx`) — link "Esqueci minha senha?" no modo
  login; passa a usar o `AuthLayout`.
- `src/lib/utils/errors.ts` (+ `.test.ts`) — `parseAuthError` mapeia
  "New password should be different from the old password" →
  *"A nova senha deve ser diferente da atual."*
- `supabase/config.toml` — bloco `[auth.email.template.recovery]` (subject
  "Redefinir sua senha - Olhar Singular") + `additional_redirect_urls` cobrindo a
  URL local de `/redefinir-senha`, já que passamos `redirectTo` explícito. Mesma
  nota do confirmation: **em produção, aplicar via Dashboard**.

## Segurança

- **Anti-enumeração de e-mail**: a `ForgotPasswordPage` mostra a mesma mensagem
  neutra tenha ou não conta com aquele e-mail. Erro do `resetPasswordForEmail` só
  vira alerta visível quando for falha de rede/rate-limit, nunca "e-mail não existe".
- **Rate limit**: o cooldown de 60s no reenvio, somado ao rate limit do próprio
  Supabase (mapeado em `parseAuthError` → "Muitas tentativas").
- **Sessão de recovery não persiste**: `signOut()` logo após a troca de senha.
- Nunca logar e-mail ou senha.

## Testes (TDD, gate 100%)

Molde: `AuthPage.test.tsx` (mock de `@/integrations/supabase/client` expondo só os
métodos usados + mock de `useNavigate`; fake timers para o cooldown).

- **ForgotPasswordPage**: valida e-mail vazio; chama `resetPasswordForEmail` com o
  `redirectTo` correto; mostra a mensagem neutra no sucesso **e** quando o e-mail
  não existe; erro de rede vira alerta; cooldown conta e libera o reenvio; "Voltar
  para login".
- **ResetPasswordPage**: os 3 estados (`checking` → `ready` via `PASSWORD_RECOVERY`
  e via `getSession`; `invalid` sem sessão); senha curta; senha ≠ confirmação;
  `updateUser` chamado; sucesso → `signOut` + `navigate("/auth")`; ramo de erro.
- **AuthPage**: o link "Esqueci minha senha?" leva a `/esqueci-senha`.
- **AuthLayout**: renderiza marca, children e rodapé.
- **errors.ts**: o novo mapeamento de "senha diferente da atual".

## Fora de escopo

- Migrar para o fluxo **PKCE** (`{{ .TokenHash }}` + `/auth/confirm` com
  `verifyOtp`). O cadastro atual é implicit; trocar os dois é tarefa própria.
- Política de força de senha além do mínimo de 6 caracteres já vigente no cadastro.
- Troca de senha com o usuário **logado** (tela de conta/perfil).
