# Database

# Database

Configuração e migrações Supabase/PostgreSQL do SpendWise. A CLI fica fixada em `3.2.0` como dependência de desenvolvimento neste pacote; o diretório de trabalho personalizado permite manter tudo sob `Database/`.

## Preparação local

Requisitos: Node.js 24 LTS, pnpm 12 e Docker Desktop em execução.

Na pasta `Database/`:

```powershell
pnpm install --frozen-lockfile
pnpm config:validate
pnpm db:start
pnpm db:status
```

Para parar os containers: `pnpm db:stop`. A stack local contém serviços de desenvolvimento; não usar credenciais nem dados reais.

## Migrações e seeds

Criar migrações com a CLI, depois de o modelo de domínio ser aprovado:

```powershell
pnpm exec supabase migration new <nome-descritivo> --workdir .
```

O `seed.sql` só deve conter dados sintéticos. A definição de tabelas, grants, RLS e dados de seed aguarda a conclusão das decisões de produto e privacidade. Configuração local de Auth não deve ser copiada para um projeto de produção sem revisão.

A CLI 3 usa a stack local por defeito; operações em projetos alojados precisam de `--remote` e aprovação. Não guardar tokens, passwords, chaves, dados pessoais reais nem cópias de produção nesta pasta.
