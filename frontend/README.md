# SpendWise app

Aplicação universal em React Native + Expo e TypeScript para web, Android e iOS. O Expo Router mantém rotas comuns e permite adaptações por plataforma quando a experiência nativa o exigir.

Os componentes devem manter interfaces pequenas: poucos parâmetros necessários, bons valores por defeito e composição clara. Consultar os [princípios de desenvolvimento](../docs/development-principles.md) antes de adicionar bibliotecas ou abstrações partilhadas.

## Autenticação local

Copiar `frontend/.env.example` para `frontend/.env` e preencher `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `EXPO_PUBLIC_SPENDWISE_API_URL` com os endpoints do ambiente em uso. São valores públicos; nunca colocar uma `service_role` ou secret key em variáveis `EXPO_PUBLIC_*`. No Android Emulator, usa o endereço do host acessível a partir do emulador, não `127.0.0.1`. Reiniciar o Expo depois de alterar variáveis.

O Supabase Auth usa PKCE, confirmação de e-mail e recuperação de palavra-passe. O URL `spendwise://auth/callback` deve constar na allowlist de redirects do Supabase Auth para Android/iOS. Para web, adicionar apenas o URL local/HTTPS de cada ambiente. A configuração local permite `http://localhost:8081/auth/callback` e `http://127.0.0.1:8081/auth/callback`. A conta Supabase e o fornecedor de hosting ainda não estão ligados ao repositório, pelo que esta configuração externa é necessária para testar os e-mails e callbacks.

Para testar callbacks de e-mail no telemóvel, usar uma development build que inclua o scheme `spendwise`. O Expo Go usa um endereço `exp://` próprio e não recebe estes callbacks com scheme personalizado.

Sessões móveis ficam em Expo SecureStore; sessões web em `sessionStorage` e terminam quando o separador fecha. A sessão web é acessível a JavaScript: manter CSP por cabeçalhos HTTP e prevenção de XSS. Consultar [privacidade e segurança](../docs/privacy-security.md) antes de configurar hosting.

## Idiomas

O produto suporta português e inglês através de `i18next` e `react-i18next`; os ecrãs de autenticação, orçamento, convites e perfil usam as traduções em `src/i18n/locales/`. Manter o texto novo nas traduções centrais, com chaves equivalentes nos dois idiomas.

## Perfil e privacidade

Com sessão autenticada, abre **Perfil e privacidade** para consultar e editar nome, telemóvel opcional e moeda predefinida. O mesmo ecrã permite pedir a eliminação da conta. Se a pessoa for OWNER de um orçamento partilhado, apresenta os membros ativos para escolher quem recebe a propriedade; sem outro membro ativo, o pedido fica bloqueado até ser adicionado um membro. A confirmação explica que os orçamentos pessoais serão apagados e que o histórico partilhado será pseudonimizado. Estes valores são apenas virtuais e a aplicação não movimenta dinheiro real.

## Requisitos

- Node.js 24 LTS
- pnpm 12 (versão fixada no `package.json`)
- Android Studio/emulador ou dispositivo Android para execução nativa
- macOS com Xcode para builds locais de iOS; sem Mac, usar um serviço de build remoto como EAS Build

## Executar

Na pasta `frontend/`:

```powershell
pnpm install
pnpm start
```

O menu do Expo permite abrir a aplicação na web ou num dispositivo/emulador. Também existem atalhos:

```powershell
pnpm web
pnpm android
pnpm ios
```

Para executar testes unitários, E2E e verificar tipos/exportar a versão web:

```powershell
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build:web
```

Os testes E2E iniciam a aplicação web em `localhost:8081` e usam autenticação, API e dados sintéticos interceptados pelo Playwright; não contactam um projeto Supabase real. A suíte corre em Chromium desktop e em emulação de viewport Pixel 7, com axe a verificar critérios WCAG 2.0/2.1 A/AA nos ecrãs cobertos. Para preparar Chromium localmente, executar `pnpm exec playwright install chromium`. A emulação móvel valida a interface web responsiva; não substitui testes numa aplicação nativa iOS/Android nem no staging.

## Builds e publicação móvel

O projeto inclui `eas.json` com perfis EAS separados:

- `preview` gera builds internas para validação, usando o ambiente Expo `preview`.
- `production` prepara builds para as lojas, usando o ambiente Expo `production` e incremento remoto do número de build. O perfil não submete nem publica automaticamente nas lojas.

Definir em cada ambiente Expo as variáveis públicas necessárias: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SPENDWISE_API_URL` e `EXPO_PUBLIC_RUNTIME_CONFIG_URL`. Usar valores Supabase e API isolados para preview/staging e valores de produção apenas no ambiente production. A URL runtime é o endereço HTTPS estável `/api/runtime-config` no domínio web; esse domínio ainda tem de ser configurado no projeto Vercel antes de builds móveis.

Antes do primeiro build, ainda é necessário definir identificadores únicos (`android.package` e `ios.bundleIdentifier`) e ligar o projeto a uma conta Expo. Não escolher estes identificadores automaticamente porque ficam associados à identidade permanente nas lojas. Também são necessários os contratos/contas developer Apple e Google, credenciais de assinatura, ícones/splash de marca, políticas de privacidade e associação dos links HTTPS. Não guardar credenciais nos ficheiros versionados.

O EAS Free inclui atualmente até 15 builds Android e 15 builds iOS por mês; a quota é sem overage no plano gratuito. Se a quota terminar, aguardar a reposição mensal ou fazer builds locais, sem ativar um plano pago. Confirmar quotas e condições atuais antes de usar.

O ecrã de aceitação de convite envia o token no corpo de um pedido autenticado à API. Antes de publicar, configurar `SPENDWISE_INVITATION_BASE_URL` com a rota HTTPS hospedada do frontend. Para abrir links HTTPS diretamente nas aplicações móveis, configurar também Universal Links/App Links e as associações de domínio Apple/Android.
