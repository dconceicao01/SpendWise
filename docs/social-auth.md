# Login com Google

O SpendWise usa Supabase Auth para iniciar sessão com Google na web e nas aplicações Expo para Android e iOS. O cliente inicia o fluxo OAuth com PKCE; as credenciais do fornecedor ficam exclusivamente na configuração de cada projeto Supabase.

## Configuração por ambiente

Repetir os passos em cada projeto Supabase, começando por staging:

1. Em **Authentication → URL Configuration**, manter o `Site URL` na origem web canónica do ambiente e adicionar à allowlist o callback web `https://<dominio-do-ambiente>/auth/callback`.
2. Adicionar os callbacks nativos `spendwise://auth/callback` e `spendwise://auth/callback?flow=oauth`. Manter também os redirects locais descritos no [guia de email Auth](email-auth-brevo.md). Em produção, não usar curingas para domínios de preview.
3. Em **Authentication → Providers**, ativar Google e preencher as credenciais. No Google Cloud, aceitar como redirect URI o callback Supabase apresentado no painel, normalmente `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Não guardar client secrets ou credenciais de fornecedor no Git, Vercel, Expo `EXPO_PUBLIC_*`, nem em mensagens. Configurá-los diretamente no painel Supabase e separadamente por ambiente.
5. Testar registo e início de sessão web, Android e iOS com contas de teste antes de ativar o provider em produção.

## Google

Criar credenciais OAuth no Google Cloud para os domínios e callback Supabase do ambiente. Configurar o ID e o segredo no provider Google do Supabase. Restringir os domínios autorizados ao necessário para SpendWise.

## Comportamento na app

- Na web, a app redireciona para Google e regressa ao callback HTTPS do mesmo ambiente.
- Android e iOS abrem a sessão OAuth no browser do sistema e regressam por `spendwise://auth/callback`; a sessão PKCE é trocada uma única vez mesmo que o router e o browser recebam o callback.
- O início de sessão por e-mail, registo com nome obrigatório e recuperação de palavra-passe continuam disponíveis.
- Cancelar o diálogo OAuth não altera a sessão atual. Erros mostram uma mensagem genérica e permitem tentar novamente ou usar e-mail.
- O nome de perfil continua obrigatório. Se o provider não o fornecer, a app pede-o antes de abrir os orçamentos.
