# Builds móveis

## Android: ARM64

Os builds Android usados pelo SpendWise são limitados a `arm64-v8a`. Esta escolha reduz o tamanho do APK e do pacote Android, mas não instala em dispositivos que só suportem ARM de 32 bits (`armeabi-v7a`) nem em emuladores x86. O aparelho de teste tem de suportar Android ARM64.

Os perfis EAS mantêm esta escolha nos builds normais:

| Perfil              | Artefacto Android                                      | Arquitetura                                 |
| ------------------- | ------------------------------------------------------ | ------------------------------------------- |
| `preview`           | APK para instalação direta                             | ARM64 (`arm64-v8a`)                         |
| `production`        | Android App Bundle para publicação                     | ARM64 (`arm64-v8a`)                         |
| `preview-arm64`     | Alias do perfil `preview`                              | ARM64 (`arm64-v8a`)                         |
| `preview-universal` | APK com as arquiteturas Android padrão do React Native | Compatibilidade mais ampla; artefacto maior |

Comandos:

```sh
cd frontend
eas build --platform android --profile preview
eas build --platform android --profile production
```

Usar `preview-universal` apenas para diagnóstico ou quando for necessário suportar dispositivos Android antigos sem ARM64. A alternativa universal deve continuar disponível para testes de compatibilidade; não é o perfil padrão para distribuir o MVP.

O argumento Gradle `-PreactNativeArchitectures=arm64-v8a` controla os ABIs incluídos. O perfil de produção gera um AAB; a Google Play pode entregar os recursos otimizados por dispositivo, mas o conteúdo nativo do SpendWise continua sem ABI de 32 bits.

## iOS

A configuração Android não altera os builds iOS. O EAS continua a produzir os artefactos iOS a partir do mesmo código Expo, usando as arquiteturas iOS suportadas pelo respetivo destino.

## Staging web e CORS

O endereço de staging para testes manuais é `https://spendwise-web-staging.vercel.app`. A API permite pedidos desse domínio exato. Aliases de Preview associados a branches, como `spendwise-web-git-develop-…vercel.app`, podem servir os ficheiros da aplicação e ainda assim falhar ao pedir dados à API, porque não estão na allowlist CORS. Usar o domínio canónico; se o domínio mudar, atualizar `SPENDWISE_CORS_ALLOWED_ORIGINS` para a origem HTTPS exata e redeployar a API. Nunca usar uma origem wildcard.
