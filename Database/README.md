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

Criar migrações com a CLI, preservando o timestamp e nome gerados:

```powershell
pnpm exec supabase migration new <nome-descritivo> --workdir .
```

O `seed.sql` só deve conter dados sintéticos. As migrations versionadas em `supabase/migrations/` criam o domínio SpendWise e as políticas de autorização. Os períodos são independentes: nenhum saldo positivo ou negativo transita para o seguinte; as estatísticas anuais podem agregar os movimentos de todos os períodos. Uma constraint impede períodos sobrepostos e triggers mantêm os movimentos dentro do período; correções ligadas a despesas preservam categoria, data efetiva e período originais. A ativação de uma alocação valida categorias ativas e exatamente 10 000 pontos base; regista `effective_from` como a data da ativação e impede arquivar categorias ainda usadas pela versão ativa. `activate_budget_allocation_set` e `record_income` são RPCs transacionais `SECURITY INVOKER`; cada rendimento usa a alocação ativa no momento do registo e guarda snapshots determinísticos que reconciliam ao valor total. A versão de alocação fica imutável em cada rendimento.

A migration MVP-08 revoga os grants herdados de `anon` e concede a `authenticated` apenas as operações cobertas por políticas RLS. Acesso a dados de orçamento exige membership ativa; OWNER altera configuração e membros; OWNER/CONTRIBUTOR registam rendimentos, despesas e ajustes; VIEWER lê; membership removida perde acesso; perfil e preferências são próprios; convites são apenas para OWNER e a aceitação por token será adicionada no MVP-16. Funções `SECURITY DEFINER` de resolução de membership existem somente em `private`, schema não exposto, e não aceitam identidade arbitrária. A criação de orçamentos/memberships e a escrita de rendimentos recorrentes ficam sem grants até existirem os fluxos transacionais respetivos. Nunca usar `service_role` em pedidos normais nem expor a chave a clientes.

Num orçamento partilhado, as alocações e saldos pertencem ao fundo comum, mantendo-se a origem de cada rendimento para histórico. Configuração local de Auth não deve ser copiada para um projeto de produção sem revisão.

A CLI 3 usa a stack local por defeito; operações em projetos alojados precisam de `--remote` e aprovação. Não guardar tokens, passwords, chaves, dados pessoais reais nem cópias de produção nesta pasta.
