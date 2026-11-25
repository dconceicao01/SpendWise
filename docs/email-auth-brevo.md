# Email de autenticação com Brevo

## Desenho

O Supabase Auth continua responsável por registo, confirmação de e-mail e recuperação de palavra-passe. O Brevo é usado como relay SMTP transacional do Supabase; o cliente web/móvel e a API Spring não enviam estes emails diretamente. Assim, não se expõem credenciais SMTP no browser, na aplicação móvel ou em pedidos normais da API.

O Supabase local mantém o Mailpit para testes. Staging e produção têm configurações SMTP separadas no respetivo projeto Supabase.

Os emails de Auth tratam apenas o endereço e o token temporário indispensável; não incluir rendimentos, despesas ou outros dados do orçamento. Antes de ativar o fornecedor, rever o DPA do Brevo, localização/subprocessadores e retenção dos registos de entrega, limitar o acesso à conta e SMTP keys, e manter os emails estritamente transacionais sem tracking de marketing.

## Preparar o remetente no Brevo

1. Verificar no Brevo o domínio de envio escolhido e configurar os registos DNS SPF/DKIM indicados pela plataforma. Publicar também uma política DMARC apropriada ao domínio.
2. Criar um remetente transacional verificado, por exemplo `SpendWise <auth@teu-dominio>`. Usar um domínio de autenticação dedicado quando existir um domínio SpendWise.
3. Em **Settings → SMTP & API → SMTP**, criar uma SMTP key. Guardar a chave apenas no gestor de segredos; não usar a API key, a palavra-passe da conta ou o hostname como login SMTP.
4. Desativar tracking de cliques e reescrita dos links para os emails de autenticação. Os links contêm credenciais temporárias de utilização única e têm de chegar ao callback sem alterações.

## Configurar cada projeto Supabase alojado

Em **Authentication → SMTP Settings**, ativar custom SMTP e usar:

| Campo | Valor |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` (STARTTLS) |
| Username | O valor **SMTP login** apresentado no painel Brevo |
| Password | A SMTP key criada para esse ambiente |
| Sender email | O remetente verificado no Brevo |
| Sender name | `SpendWise` ou `SpendWise Staging` |

Criar credenciais SMTP distintas para staging e produção, quando possível. Inserir a chave diretamente no painel do Supabase como password secreta; nunca a guardar no GitHub, em `.env` versionado, em Vercel ou em variáveis `EXPO_PUBLIC_*`. Manter email de confirmação ativo e não ativar autoconfirmação para contornar problemas de entrega. O limite de envio inicial do Supabase pode ser baixo; verificar **Authentication → Rate Limits** antes dos testes com vários destinatários.

## URLs e templates Auth

Configurar cada projeto Supabase independentemente em **Authentication → URL Configuration**:

- `Site URL`: origem web canónica daquele ambiente, sem caminho; staging e produção devem ter valores diferentes.
- `Redirect URLs`: acrescentar o URL HTTPS exato `https://<origem-web-do-ambiente>/auth/callback`, os URLs locais `http://localhost:8081/auth/callback` e `http://127.0.0.1:8081/auth/callback`, e `spendwise://auth/callback` para as builds nativas.
- Acrescentar URLs de preview apenas quando necessário para validar callbacks, limitando-os ao host de preview pretendido. Não usar curingas em produção.

Os formulários web/móveis passam o callback do ambiente ativo ao criar conta ou pedir recuperação. O callback Expo Router troca códigos PKCE com `exchangeCodeForSession`; também aceita links de template que entreguem `token_hash` e um tipo de email permitido, usando `verifyOtp`. Ligações de recuperação levam ao ecrã para definir uma palavra-passe; falhas e links expirados apresentam uma mensagem genérica. As builds nativas requerem o scheme `spendwise` e uma development build ou build distribuída; Expo Go não é um destino estável para estes links.

Manter os templates Supabase de confirmação e recuperação baseados em `{{ .ConfirmationURL }}` para o fluxo padrão. Se forem personalizados, não remover o `redirect_to` fornecido pelo Supabase nem reescrever o callback para um URL não autorizado. Não incluir dados de orçamento nos emails.

## Verificação de staging

Depois de guardar a configuração nos painéis dos fornecedores:

1. Registar uma conta de teste cujo endereço não faça parte da equipa Supabase. O registo deve mostrar uma confirmação neutra e o email deve chegar pelo Brevo.
2. Abrir a ligação uma vez: deve regressar ao host web de staging, confirmar o email e mostrar a mensagem de sucesso. A ligação reutilizada ou expirada deve mostrar erro genérico e não iniciar sessão.
3. Pedir recuperação de palavra-passe; o link deve abrir o ecrã de nova palavra-passe, atualizar a credencial e permitir iniciar sessão com a nova palavra-passe.
4. Repetir a verificação num Android/iOS com build que inclua `spendwise://auth/callback`.
5. Confirmar no Brevo que destinatário, remetente, entrega e métricas mínimas estão corretos. Não guardar corpos completos dos emails ou tokens em logs.

A configuração SMTP alojada e os respetivos segredos ainda têm de ser introduzidos nos painéis dos fornecedores; este repositório não os pode ativar sem a SMTP key e acesso de configuração aos projetos.
