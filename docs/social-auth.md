# Login com Google e Apple

O SpendWise usa Supabase Auth para iniciar sessão com Google e Apple, tanto na web como nas aplicações Expo para Android e iOS. O cliente inicia o fluxo OAuth com PKCE; os segredos dos fornecedores ficam exclusivamente na configuração de cada projeto Supabase.

## Configuração por ambiente

Repetir os passos em cada projeto Supabase, começando por staging:

1. Em **Authentication → URL Configuration**, manter o `Site URL` na origem web canónica do ambiente e adicionar à allowlist o callback web `https://<dominio-do-ambiente>/auth/callback`.
2. Adicionar os callbacks nativos `spendwise://auth/callback` e `spendwise://auth/callback?flow=oauth`. Manter também os redirects locais descritos no [guia de email Auth](email-auth-brevo.md). Em produção, não usar curingas para domínios de preview.
3. Em **Authentication → Providers**, ativar Google e Apple e preencher as credenciais do respetivo fornecedor. O Google e a Apple devem aceitar como redirect URI o callback Supabase apresentado no painel, normalmente `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Não guardar client secrets, chaves privadas ou credenciais de fornecedor no Git, Vercel, Expo `EXPO_PUBLIC_*`, nem em mensagens. São configuradas diretamente no painel Supabase e separadas por ambiente.
5. Testar registo e início de sessão web, Android e iOS com contas de teste antes de ativar os providers em produção.

### Google

Criar credenciais OAuth no Google Cloud para os domínios e callback Supabase do ambiente. Configurar os IDs/segredos no provider Google do Supabase. Restringir os domínios autorizados ao necessário para SpendWise.

### Apple

Configurar o provider Apple com o Services ID, Team ID, Key ID e chave privada exigidos pelo Supabase, e registar o callback Supabase como Return URL no portal Apple. A autenticação OAuth pode não devolver o nome da pessoa. Se o perfil Supabase não tiver nome, o SpendWise pede-o depois do primeiro login e guarda-o nos metadados da conta, de acordo com a regra de perfil do produto.

A chave OAuth de Apple tem validade limitada e precisa de renovação periódica; registar um lembrete operacional e atualizar o segredo no Supabase antes de expirar. A disponibilidade e os requisitos de configuração Apple dependem também da conta Apple Developer e do identificador da app.

## Comportamento na app

- Web redireciona para o provider e regressa ao callback HTTPS do mesmo ambiente.
- Android e iOS abrem a sessão OAuth no browser do sistema e regressam por `spendwise://auth/callback`; a sessão PKCE é trocada uma única vez mesmo que o router e o browser recebam o callback.
- O botão por e-mail continua disponível para início de sessão, registo com nome obrigatório e recuperação de palavra-passe.
- Cancelar o diálogo OAuth não altera a sessão atual. Erros mostram uma mensagem genérica e permitem tentar novamente ou usar e-mail.
- O nome de perfil continua obrigatório. Se o provider não o fornecer, a app pede-o antes de abrir os orçamentos.

Esta documentação prepara o código, mas não ativa credenciais nos projetos alojados. A configuração e os testes com contas de fornecedor continuam necessários para disponibilizar Google e Apple em staging e produção.
