# SpendWise app

Aplicação universal em React Native + Expo e TypeScript para web, Android e iOS. O Expo Router mantém rotas comuns e permite adaptações por plataforma quando a experiência nativa o exigir.

Os componentes devem manter interfaces pequenas: poucos parâmetros necessários, bons valores por defeito e composição clara. Consultar os [princípios de desenvolvimento](../docs/development-principles.md) antes de adicionar bibliotecas ou abstrações partilhadas.

## Autenticação local

Copiar `frontend/.env.example` para `frontend/.env` e preencher apenas `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` do projeto Supabase local. São valores públicos; nunca colocar uma `service_role` ou secret key em variáveis `EXPO_PUBLIC_*`. Reiniciar o Expo depois de alterar variáveis.

O Supabase Auth usa PKCE, confirmação de e-mail e recuperação de palavra-passe. O URL `spendwise://auth/callback` deve constar na allowlist de redirects do Supabase Auth para Android/iOS. Para web, adicionar apenas o URL local/HTTPS de cada ambiente. A conta Supabase e o fornecedor de hosting ainda não estão ligados ao repositório, pelo que esta configuração externa é necessária para testar os e-mails e callbacks.

Sessões móveis ficam em Expo SecureStore; sessões web em `sessionStorage` e terminam quando o separador fecha. A sessão web é acessível a JavaScript: manter CSP por cabeçalhos HTTP e prevenção de XSS. Consultar [privacidade e segurança](../docs/privacy-security.md) antes de configurar hosting.

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

Para verificar tipos e exportar a versão web:

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build:web
```

## Publicação móvel

O projeto já inclui alvos Expo para Android e iOS, mas ainda não está pronto para publicação. Antes de distribuir nas lojas, definir identificadores únicos (`android.package` e `ios.bundleIdentifier`), contas de developer, credenciais de assinatura, ícones/splash de marca, políticas de privacidade e pipelines de build/release. Não guardar credenciais nos ficheiros versionados.

O ecrã atual é apenas um ponto de entrada técnico. Não implementa autenticação, dados, poupanças ou chamadas externas. Os fluxos funcionais aguardam as decisões do MVP-01 e os contratos da API.
