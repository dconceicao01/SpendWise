# SpendWise Web

Scaffold da interface em React + TypeScript + Vite. Usa Node.js 24 LTS e pnpm 12, com versões de dependências fixadas em `package.json`.

## Executar

Na pasta `frontend/`:

```powershell
pnpm install
pnpm dev
```

O servidor de desenvolvimento fica limitado a `127.0.0.1`. Para verificar tipos e gerar o build:

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

O ecrã atual é apenas um ponto de entrada técnico. Não implementa autenticação, dados, poupanças ou chamadas externas. Os fluxos funcionais aguardam as decisões do MVP-01 e os contratos da API.
