# SpendWise app

Aplicação universal em React Native + Expo e TypeScript para web, Android e iOS. O Expo Router mantém rotas comuns e permite adaptações por plataforma quando a experiência nativa o exigir.

Os componentes devem manter interfaces pequenas: poucos parâmetros necessários, bons valores por defeito e composição clara. Consultar os [princípios de desenvolvimento](../docs/development-principles.md) antes de adicionar bibliotecas ou abstrações partilhadas.

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
