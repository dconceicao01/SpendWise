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

A migration MVP-08 revoga os grants herdados de `anon` e concede a `authenticated` apenas as operações cobertas por políticas RLS. Acesso a dados de orçamento exige membership ativa; OWNER altera configuração e membros; OWNER/CONTRIBUTOR registam rendimentos, despesas e ajustes; VIEWER lê; membership removida perde acesso; perfil e preferências são próprios; convites são criados por OWNER e partilhados através de link de utilização única. No MVP-16, `accept_budget_invitation` valida o hash, expiração, revogação, email Auth confirmado e não utilização, criando membership e consumindo o convite na mesma transação. As tentativas de aceitação são limitadas a 5 por utilizador em 15 minutos; criações são limitadas a 10 por orçamento por hora, com serialização transacional. Os contadores em `private` não guardam IP e são eliminados após 24 horas. Emails são removidos quando os convites são aceites ou revogados; convites expirados são eliminados 30 dias após a expiração por um job horário `pg_cron`. Funções `SECURITY DEFINER` de resolução de membership existem somente em `private`, schema não exposto, e não aceitam identidade arbitrária. A criação de orçamentos/memberships usa RPCs estreitas para manter a transação e derivar a identidade de `auth.uid()`. Nunca usar `service_role` em pedidos normais nem expor a chave a clientes.

Num orçamento partilhado, as alocações e saldos pertencem ao fundo comum, mantendo-se a origem de cada rendimento para histórico. Configuração local de Auth não deve ser copiada para um projeto de produção sem revisão.

O Auth local exige confirmação de e-mail, usa palavra-passe mínima de 8 caracteres e aceita redirects locais `http://localhost:8081/auth/callback`, `http://127.0.0.1:8081/auth/callback` e `spendwise://auth/callback`. Os e-mails locais são capturados pelo servidor SMTP de teste e podem ser consultados na interface Mailpit. Em projetos alojados, configurar URLs explícitos por ambiente e validar SMTP, templates, limites e política de sessão antes de lançar.

A CLI 3 usa a stack local por defeito; operações em projetos alojados precisam de `--remote` e aprovação. Não guardar tokens, passwords, chaves, dados pessoais reais nem cópias de produção nesta pasta.

Para colaboração, `list_budget_members` é uma RPC `SECURITY DEFINER` de leitura estritamente limitada: deriva o utilizador de `auth.uid()`, exige membership ativa no orçamento e devolve apenas membership e nome de perfil de membros ativos desse mesmo orçamento. Se o perfil ainda não existir, usa apenas o `full_name` do metadata Auth criado no registo. `user_id`, email, telefone e restantes campos do perfil continuam privados. As memberships são alteradas pela Data API com RLS: OWNER muda papéis entre CONTRIBUTOR/VIEWER ou define `removed_at`; a linha histórica não é apagada e pedidos seguintes deixam de reconhecer a membership.

Na MVP-17, `record_income` grava o rendimento e os snapshots da alocação ativa atomicamente; a autorização e o membro que regista vêm de `auth.uid()`. `record_expense` e `record_budget_adjustment` são RPCs `SECURITY INVOKER`, limitadas a OWNER/CONTRIBUTOR e protegidas pelas policies RLS existentes. A base de dados valida que a data pertence ao período. Um ajuste ligado a despesa existente tem de manter o seu período, data efetiva e categoria, sem alterar nem apagar o registo original. As RPCs ficam executáveis apenas por `authenticated`; os novos fluxos não introduzem uma credencial privilegiada.

No MVP-20, OWNER/CONTRIBUTOR podem criar e gerir agendamentos virtuais semanais, quinzenais ou mensais; OWNER também pode gerir agendamentos criados por outros membros. A criação exige uma alocação ativa. Para datas mensais inexistentes em alguns meses, o utilizador escolhe entre executar no último dia do mês ou saltar esse mês, mantendo o dia âncora nos meses seguintes. Ao retirar a membership do criador ou mudar o seu papel para VIEWER, um trigger privado pausa os agendamentos ativos; após recuperar permissões, um OWNER retoma-os explicitamente. O trigger de validação é uma função privada `SECURITY DEFINER`, com `search_path` fixo e execução revogada para os papéis da aplicação; só permite a retoma quando o criador volta a ter um papel elegível. `pg_cron` chama diariamente uma única função `private.process_due_income_schedules()` com `SECURITY DEFINER`, `search_path` fixo e execução revogada a `anon`, `authenticated` e `service_role`. A função processa cada ocorrência com lock e `SKIP LOCKED`, usa a alocação ativa no momento em que grava, mantém a data original e a chave única `(schedule_id, scheduled_for)` para idempotência. Ocorrências vencidas sem período compatível ficam pendentes em `next_occurrence_on`; falhas numa recorrência não interrompem as outras. Os registos continuam a ser valores virtuais do SpendWise.

No MVP-23, o Auth usa os limites anti-abuso próprios do Supabase para inscrição, verificação, recuperação e refresh; confirmar as definições de rate limit em cada projeto antes do deploy. Convites mantêm os limites aprovados: 5 aceitações por utilizador em 15 minutos e 10 criações por orçamento/hora. As escritas autenticadas às tabelas de domínio têm um limite adicional de 120 transações por utilizador em janela móvel de 60 segundos. Triggers privados contam uma vez por transação Postgres, mesmo quando uma operação altera várias linhas; lock transacional e chave única protegem contra pedidos concorrentes. O registo mínimo (utilizador, ID da transação e timestamp) fica em `private`, não guarda IP nem payload, é eliminado após 24 horas e desaparece com a conta por `ON DELETE CASCADE`. A API Spring traduz a rejeição para HTTP 429. Jobs de sistema sem `auth.uid()` não consomem a quota de uma pessoa.

Staging e produção incluem a API Spring publicada, além do frontend e de um projeto Supabase próprio por ambiente. O hosting da API e do frontend ainda precisa de ser escolhido antes do provisionamento.
# Direitos de dados e eliminação de conta (MVP-22)

O perfil próprio é consultado/alterado em `/api/v1/me/profile`; nome e moeda são obrigatórios, telefone é opcional e o email continua sob gestão do Auth. O pedido autenticado `/api/v1/me/deletion` executa uma RPC `SECURITY DEFINER` deliberadamente estreita, com `search_path=pg_catalog`, `auth.uid()` como única identidade e execução concedida apenas a `authenticated`. A operação valida transferências explícitas de OWNER, apaga orçamentos pessoais e dados associados, revoga convites ainda abertos, elimina preferências de lembretes e retira a identidade de memberships partilhadas preservando os movimentos e referências pseudonimizadas. Um pedido pendente é guardado em `private`, invisível à Data API, e os helpers/RLS bloqueiam a identidade até a API executar a eliminação Auth Admin depois do commit. A chave `SUPABASE_SERVICE_ROLE_KEY` só existe no backend e só é usada nesse pedido Admin, nunca em operações de dados. A eliminação Auth remove a identidade e impede novas sessões, mas JWTs já emitidos podem permanecer criptograficamente válidos até à expiração; a base de dados já lhes nega acesso após o commit da limpeza. O histórico partilhado pseudonimizado fica enquanto o orçamento existir e é eliminado com ele. Política e retenção de backups do fornecedor têm de ser revistas e aprovadas antes da produção; não assumir que excluir a base ativa apaga imediatamente as cópias de backup.

## Região e recuperação de desastre (decisão de piloto)

O projeto Supabase fica em Paris (`eu-west-3`). O plano Free é aceite em desenvolvimento/staging e num piloto de baixa afluência, aceitando pausa após inatividade e ausência de backups geridos; não se promete SLA. Objetivos aprovados: RPO ≤24h, RTO ≤8h e retenção de 7 dias. A estratégia planeada usa Cloudflare R2 na jurisdição EU, cifragem no cliente e apenas a quota gratuita, sem overage: parar e alertar antes de exceder limites.

Esta estratégia ainda não está implementada nem validada. A documentação Supabase está contraditória sobre `auth.users`: o guia de migração para self-hosted diz que é incluído, mas a referência atual da CLI diz que `supabase db dump` exclui `auth`. O dump CLI não deve ser tratado como backup completo de Auth até existir esclarecimento ou um processo suportado, validado num restauro. Jobs GitHub Actions são best effort; monitorizar frescura após a solução ser aprovada e executar restauro trimestral. Os objetivos RPO/RTO só passam a resultados demonstrados após esse exercício. A retenção de 7 dias deve ser considerada no processo de eliminação RGPD. Ver [runbook de recuperação](../docs/disaster-recovery.md).

Lovable fica limitado a prototipagem/preview sem backend/Lovable Cloud; não foi escolhido como hosting de produção.
