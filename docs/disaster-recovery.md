# Cópias de segurança e recuperação

Este runbook define o processo de recuperação do piloto SpendWise. Os objetivos aprovados são **RPO ≤24 horas**, **RTO ≤8 horas** e **retenção de 7 dias**. São metas por demonstrar: só um exercício completo e cronometrado comprova que são alcançáveis.

## Âmbito e limites

- Incluir schema, dados, policies, funções, triggers, grants e utilizadores/dados Auth do projeto Supabase.
- Há informação contraditória na documentação oficial: o guia de migração para self-hosted afirma que `auth.users` está incluído, mas a referência atual da CLI diz que `supabase db dump` exclui os schemas geridos `auth` e `storage`. Até a Supabase esclarecer o conflito ou um processo suportado ser validado de ponta a ponta, não considerar o dump CLI uma cópia completa de Auth.
- Se o projeto tiver personalizações em schemas geridos (`auth` ou `storage`), como triggers ou policies próprias, verificar e versionar essas alterações separadamente; o guia CLI trata-as como personalizações que podem exigir exportação/diff próprio. Objetos Storage não são ficheiros incluídos no dump.
- Configuração de Auth — providers, URLs de redirect, SMTP, templates, JWT secrets e chaves — não é recuperada como configuração SQL. Guardar apenas a configuração não secreta no inventário operacional; segredos ficam num gestor de segredos próprio, separados do backup.
- Não incluir artefactos de build, logs, tokens de sessão ou credenciais. Dumps contêm dados pessoais e valores virtuais, pelo que devem ter acesso restrito e cifragem antes de saírem do runner.
- Cloudflare R2 deve usar a jurisdição EU e apenas a quota gratuita disponível. A automação tem de impedir uploads que ultrapassem o limite definido e alertar; não ativar billing/overage. Reconfirmar quotas e condições antes de ativar.

## Processo planeado — ainda bloqueado para ativação

1. Agendar uma cópia diária, com execução manual disponível para cópia antes de migrações relevantes. GitHub Actions é best effort: a monitorização tem de alertar se a cópia válida mais recente tiver mais de 24 horas.
2. Usar uma versão de Supabase CLI fixada e revista. A CLI v3 mudou para operações locais por defeito e confirmação explícita de alterações remotas; rever as instruções de migração antes de atualizar a versão no job.
3. Exportar roles, schema e dados em artefactos temporários. A utilização de `supabase db dump` para a base de aplicação não resolve por si só a cópia de Auth. A automação tem de falhar fechada até incluir um método suportado e restaurável para a identidade e dados Auth.
4. Empacotar e cifrar localmente com uma chave mantida fora do runner e do bucket. Nunca enviar dumps em claro para artefactos GitHub, logs ou object storage.
5. Fazer upload para R2 com chave de objeto datada, após verificar tamanho e quota. Aplicar retenção de 7 dias incluindo versões/objetos antigos, e confirmar periodicamente que a expiração ocorreu.
6. Registar apenas timestamp, duração, tamanho cifrado, resultado e checksum do artefacto cifrado. Não registar URL de conexão, conteúdo SQL, dados pessoais ou material de chave.

## Recuperação

1. Declarar incidente e selecionar a última cópia cifrada válida. A cópia deve ter no máximo 24 horas para cumprir o RPO.
2. Criar um projeto Supabase isolado na região aprovada, sem ligar clientes de produção. Repor primeiro os segredos/configuração operacional a partir do gestor de segredos e validar URLs, providers, SMTP e configuração JWT.
3. Descarregar a cópia e decifrá-la apenas num ambiente controlado; validar checksum e origem antes de executar SQL.
4. Restaurar roles, schema e dados na ordem indicada pelo guia Supabase. Fazer reconciliação de contagens em tabelas do domínio e `auth.users`, extensões, policies, funções, triggers e grants.
5. Validar login/reauth, leitura e escrita por OWNER/CONTRIBUTOR/VIEWER, negação a utilizador removido e chamadas não autenticadas. Tokens antigos podem deixar de ser válidos; exigir novo login quando necessário.
6. Cronometrar desde a declaração até à validação. Só considerar cumprido o RTO se terminar em até 8 horas; registar lacunas e corrigir antes de depender do procedimento.

## Retenção e RGPD

Aplicar expiração aos sete dias e verificar a remoção efetiva de objetos antigos. Um pedido de apagamento pode continuar presente numa cópia até esta expirar; o aviso de privacidade e o registo de atividades devem refletir esse prazo. O restauro operacional não deve reintroduzir dados já apagados sem reaplicar os pedidos de apagamento registados após a data da cópia. Rever DPA, subprocessadores, localização e termos de ambos os fornecedores antes de usar dados pessoais reais.

## Verificação periódica

- Todos os dias: verificar sucesso e frescura; alertar antes de o RPO ultrapassar 24 horas.
- Após alterar schema ou configuração Auth: confirmar a cobertura do backup e atualizar o procedimento de restauro.
- Trimestralmente: executar restauro completo isolado, medir RTO, validar integridade e registar evidência sem dados pessoais.
- Antes de aumentar o piloto ou sair do plano gratuito: rever capacidade, custos, localização, contrato, retenção e objetivos de recuperação.

## Estado

Este documento é o procedimento pretendido. A automação, o armazenamento R2, os alertas de frescura e um restauro comprovado continuam por configurar. Não declarar o serviço recuperável nem os objetivos RPO/RTO atingidos até completar os passos e um exercício de restauro.

## Referências do fornecedor

- [Supabase CLI: `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump) — indica que os schemas geridos `auth` e `storage` são excluídos.
- [Supabase: Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform) — afirma que `auth.users` e dados relacionados estão incluídos, em conflito com a referência da CLI.
- [Supabase CLI v3](https://supabase.com/changelog/supabase-cli-v3) — alteração de comportamento para operações locais por defeito e confirmações de alterações remotas.
