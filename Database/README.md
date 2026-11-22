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

O `seed.sql` só deve conter dados sintéticos. As migrations versionadas em `supabase/migrations/` criam o domínio SpendWise e as políticas de autorização. Os períodos são independentes: nenhum saldo positivo ou negativo transita para o seguinte; as estatísticas anuais podem agregar os movimentos de todos os períodos. Uma constraint impede períodos sobrepostos e triggers mantêm os movimentos dentro do período; correções ligadas a despesas preservam categoria, data efetiva e período originais. Categorias são criadas por `create_budget_category`; novas versões são criadas em `DRAFT` por `create_budget_allocation_draft`, e `replace_budget_allocation_draft` substitui os itens integralmente na mesma transação. As duas RPCs derivam membership e identidade de `auth.uid()` e permanecem `SECURITY INVOKER`. A ativação em `activate_budget_allocation_set` valida categorias ativas e exatamente 10 000 pontos base, regista `effective_from` como a data da ativação e impede arquivar categorias ainda usadas pela versão ativa. `record_income` usa a alocação ativa no momento do registo e guarda snapshots determinísticos que reconciliam ao valor total. A versão de alocação fica imutável em cada rendimento.

A migration MVP-08 revoga os grants herdados de `anon` e concede a `authenticated` apenas as operações cobertas por políticas RLS. Acesso a dados de orçamento exige membership ativa; OWNER altera configuração e membros; OWNER/CONTRIBUTOR registam rendimentos, despesas e ajustes; VIEWER lê; membership removida perde acesso; perfil e preferências são próprios; convites são criados por OWNER e partilhados através de link de utilização única. No MVP-16, `accept_budget_invitation` valida o hash, expiração, revogação, email Auth confirmado e não utilização, criando membership e consumindo o convite na mesma transação. As tentativas de aceitação são limitadas a 5 por utilizador em 15 minutos; criações são limitadas a 10 por orçamento por hora, com serialização transacional. Os contadores em `private` não guardam IP e são eliminados após 24 horas. Emails são removidos quando os convites são aceites ou revogados; convites expirados são eliminados 30 dias após a expiração por um job horário `pg_cron`. Funções `SECURITY DEFINER` de resolução de membership existem somente em `private`, schema não exposto, e não aceitam identidade arbitrária. A criação de orçamentos/memberships e a escrita de rendimentos recorrentes ficam sem grants até existirem os fluxos transacionais respetivos. Nunca usar `service_role` em pedidos normais nem expor a chave a clientes.

Num orçamento partilhado, as alocações e saldos pertencem ao fundo comum, mantendo-se a origem de cada rendimento para histórico. Configuração local de Auth não deve ser copiada para um projeto de produção sem revisão.

O Auth local exige confirmação de e-mail, usa palavra-passe mínima de 8 caracteres e aceita redirects locais `http://localhost:8081/auth/callback`, `http://127.0.0.1:8081/auth/callback` e `spendwise://auth/callback`. Os e-mails locais são capturados pelo servidor SMTP de teste e podem ser consultados na interface Mailpit. Em projetos alojados, configurar URLs explícitos por ambiente e validar SMTP, templates, limites e política de sessão antes de lançar.

A CLI 3 usa a stack local por defeito; operações em projetos alojados precisam de `--remote` e aprovação. Não guardar tokens, passwords, chaves, dados pessoais reais nem cópias de produção nesta pasta.

Para colaboração, `list_budget_members` é uma RPC `SECURITY DEFINER` de leitura estritamente limitada: deriva o utilizador de `auth.uid()`, exige membership ativa no orçamento e devolve apenas membership e nome de perfil de membros ativos desse mesmo orçamento. Se o perfil ainda não existir, usa apenas o `full_name` do metadata Auth criado no registo. `user_id`, email, telefone e restantes campos do perfil continuam privados. As memberships são alteradas pela Data API com RLS: OWNER muda papéis entre CONTRIBUTOR/VIEWER ou define `removed_at`; a linha histórica não é apagada e pedidos seguintes deixam de reconhecer a membership.
