# Cópias de segurança e recuperação

Este runbook define o processo de recuperação do piloto SpendWise. Os objetivos aprovados são **RPO ≤24 horas**, **RTO ≤8 horas** e **retenção de 7 dias**. São metas por demonstrar: só um exercício completo e cronometrado comprova que são alcançáveis.

## Âmbito e limites

- Incluir schema, dados, policies, funções, triggers, grants e utilizadores/dados Auth do projeto Supabase.
- Foi escolhido o guia Supabase de migração da plataforma para self-hosted como procedimento de restauro. Esse guia declara que `auth.users` e dados relacionados estão incluídos; a referência geral da CLI descreve exclusões dos schemas geridos `auth` e `storage`. Por isso o workflow falha fechado: exige marcadores de `auth.users` e `auth.identities` no schema e nos dados antes de cifrar ou fazer upload.
- Se o projeto tiver personalizações em schemas geridos (`auth` ou `storage`), como triggers ou policies próprias, verificar e versionar essas alterações separadamente; o guia CLI trata-as como personalizações que podem exigir exportação/diff próprio. Objetos Storage não são ficheiros incluídos no dump.
- Configuração de Auth — providers, URLs de redirect, SMTP, templates, JWT secrets e chaves — não é recuperada como configuração SQL. Guardar apenas a configuração não secreta no inventário operacional; segredos ficam num gestor de segredos próprio, separados do backup.
- Não incluir artefactos de build, logs, tokens de sessão ou credenciais. Dumps contêm dados pessoais e valores virtuais, pelo que devem ter acesso restrito e cifragem antes de saírem do runner.
- Cloudflare R2 deve usar a jurisdição EU e apenas a quota gratuita disponível. A automação tem de impedir uploads que ultrapassem o limite definido e alertar; não ativar billing/overage. Reconfirmar quotas e condições antes de ativar.

## Processo de backup

1. O workflow `.github/workflows/supabase-backup.yml` executa diariamente às 03:17 UTC quando `SPENDWISE_BACKUP_ENABLED=true`; também suporta execução manual após confirmação. GitHub Actions é best effort; verificar falhas e frescura, e alertar se a última cópia válida passar 24 horas.
2. O CLI Supabase fica fixado pela dependência `Database/package.json`; `age` fica fixado em 1.2.1. A CLI v3 mudou para operações locais por defeito; os comandos usam a connection string explícita. Os dumps de schema e dados passam `--schema auth,public,private`: `auth` preserva as tabelas Auth necessárias, `public` contém o domínio e `private` contém funções e objetos internos da aplicação. O dump de roles é separado e não usa filtro de schema. O validador bloqueia o upload se `auth.users` ou `auth.identities` estiverem ausentes.
3. Exportar roles, schema e dados em ficheiros temporários. A validação recusa o envio se não encontrar `auth.users` e `auth.identities` no schema e nos dados.
4. Empacotar e cifrar localmente com a chave pública age. A chave privada de recuperação deve ser guardada offline num gestor de segredos; nunca no repositório, GitHub Actions, runner ou bucket. Dumps em claro não são publicados como artefactos GitHub.
5. O script de upload lista o bucket, remove backups SpendWise com mais de 7 dias, bloqueia upload se o armazenamento projetado ultrapassar 9 GB e valida tamanho/checksum após upload. O bucket tem de ter uma regra lifecycle de 7 dias configurada e confirmada antes de ativar; o job exige essa confirmação. A limpeza do provider é eventual (normalmente até 24h após a expiração) e o exercício deve verificar objetos e versões residuais.
6. R2 usa o endpoint EU. A quota gratuita indicada atualmente é 10 GB-mês; o limite interno de 9 GB deixa margem. Reconfirmar quotas e preço antes da configuração, pois podem mudar.
7. Registar apenas resultado, tamanho cifrado e checksum do artefacto cifrado. Não registar URL de conexão, conteúdo SQL, dados pessoais ou material de chave.

### Configuração antes de ativar

Criar o GitHub Environment `spendwise-backup`, guardar como secrets `SPENDWISE_SUPABASE_DB_URL`, `SPENDWISE_R2_ACCESS_KEY_ID` e `SPENDWISE_R2_SECRET_ACCESS_KEY`, e definir como variables `SPENDWISE_AGE_RECIPIENT`, `SPENDWISE_R2_ACCOUNT_ID`, `SPENDWISE_R2_BUCKET`, `SPENDWISE_R2_PREFIX`, `SPENDWISE_R2_LIFECYCLE_CONFIRMED=true` e `SPENDWISE_R2_ACCOUNT_ISOLATED=true`. Criar uma chave R2 restrita ao bucket e uma chave age de cifragem; a chave privada age fica offline. O interruptor `SPENDWISE_BACKUP_ENABLED` fica inicialmente ausente/desligado. Confirmar no painel que a conta Cloudflare não tem uso R2 alheio ao SpendWise, pois o guard local mede objetos do bucket e não o uso agregado da conta. Preferir uma credencial de base de dados só de leitura, quando suportada. Ativar a agenda apenas depois de uma execução manual bem-sucedida e de rever o restauro.

O agendamento do GitHub só funciona na branch por omissão (`main` neste repositório); ficará ativo após integrar a mudança nessa branch. `SPENDWISE_BACKUP_ENABLED` é a variável global de interrupção. Falhas aparecem no estado do workflow; alertas externos de falha/frescura ainda precisam de configuração própria.

## Recuperação

1. Declarar incidente e selecionar a última cópia cifrada válida. A cópia deve ter no máximo 24 horas para cumprir o RPO.
2. Preparar um destino Supabase self-hosted novo e isolado conforme o guia escolhido, sem apontar clientes de produção para ele. Repor primeiro a configuração operacional e secrets a partir do gestor de segredos; confirmar extensões e compatibilidade da versão de Postgres/Auth.
3. Descarregar o artefacto cifrado para um ambiente controlado. Desencriptar com a chave privada age offline; listar e conferir os nomes de ficheiro previstos antes de extrair. Validar `SHA256SUMS` e executar `verify-dump.mjs`. Não executar ficheiros SQL se qualquer verificação falhar.
4. Confirmar que o destino é self-hosted, isolado e novo. Definir a connection string em `SELF_HOSTED_DB_URL` no terminal privado; não a copiar para comandos em texto, logs ou tickets. O guia do fornecedor restaura numa única transação:

   ```sh
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "$SELF_HOSTED_DB_URL"
   ```

   `session_replication_role = replica` desativa triggers durante a importação. O comando pode falhar se a versão da plataforma for mais recente do que o alvo; nesse caso, não editar a cópia original nem prosseguir para produção. Resolver compatibilidade num ambiente de teste e registar as transformações.
5. Fazer reconciliação de contagens nas tabelas do domínio e `auth.users`, extensões, policies, funções, triggers e grants. Os settings de Auth (JWT, providers, redirects e SMTP) são configurados separadamente; tokens anteriores exigem novo login.
6. Validar login/reauth, leitura e escrita por OWNER/CONTRIBUTOR/VIEWER, negação a utilizador removido e pedidos não autenticados.
7. Cronometrar desde a declaração até à validação. Só considerar cumprido o RTO se terminar em até 8 horas; registar lacunas e corrigir antes de depender do procedimento.

## Retenção e RGPD

Aplicar expiração aos sete dias e verificar a remoção efetiva de objetos antigos. Um pedido de apagamento pode continuar presente numa cópia até esta expirar; o aviso de privacidade e o registo de atividades devem refletir esse prazo. O restauro operacional não deve reintroduzir dados já apagados sem reaplicar os pedidos de apagamento registados após a data da cópia. Rever DPA, subprocessadores, localização e termos de ambos os fornecedores antes de usar dados pessoais reais.

## Verificação periódica

- Todos os dias: verificar sucesso e frescura; alertar antes de o RPO ultrapassar 24 horas.
- Após alterar schema ou configuração Auth: confirmar a cobertura do backup e atualizar o procedimento de restauro.
- Trimestralmente: executar restauro completo isolado, medir RTO, validar integridade e registar evidência sem dados pessoais.
- Antes de aumentar o piloto ou sair do plano gratuito: rever capacidade, custos, localização, contrato, retenção e objetivos de recuperação.

## Estado

O workflow e os scripts estão preparados, mas permanecem inativos até configurar o GitHub Environment, projeto Supabase, bucket EU e segredos. Não existe ainda um servidor self-hosted de recuperação nem alertas externos. Não declarar o serviço recuperável nem os objetivos RPO/RTO atingidos até executar um backup manual completo, restaurar Auth e dados num destino isolado e medir o exercício.

## Referências do fornecedor

- [Supabase: Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform) — procedimento escolhido; afirma que `auth.users` e dados relacionados estão incluídos e descreve configuração separada de JWT, providers e SMTP.
- [Supabase CLI: `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump) — documenta filtragem de schemas geridos; o validador no workflow impede o upload se faltar Auth.
- [Supabase CLI v3](https://supabase.com/changelog/supabase-cli-v3) — alteração de comportamento para operações locais por defeito e confirmações de alterações remotas.
- [Cloudflare R2: jurisdição e endpoint EU](https://developers.cloudflare.com/r2/reference/data-location/) — o endpoint S3 inclui `.eu` para recursos na jurisdição europeia.
- [Cloudflare R2: preço e quota gratuita](https://developers.cloudflare.com/r2/pricing/) — quota de armazenamento indicada atualmente como 10 GB-mês.
- [Cloudflare R2: lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) — regras de expiração e atraso eventual de remoção.
