# Preparar e verificar staging

## Âmbito

Este runbook prepara a validação de um staging persistente, separado de produção e com dados sintéticos. O piloto pessoal aprovado na Vercel usa projetos web e API separados, com `frontend/` e `backend/` como diretórios raiz. A Vercel pode publicar ambos através da integração GitHub; este workflow não publica, não migra dados e não escreve na base de dados. Executa apenas verificações HTTP depois de o deploy estar concluído.

Quando presentes na branch selecionada, usar os ficheiros `frontend/vercel.json` e `backend/vercel.json` para a configuração versionada. Nunca apontar previews, staging ou testes para o projeto Supabase de produção.

## Configuração externa necessária

1. Criar/configurar projetos Vercel separados com root directories `frontend/` e `backend/`; ligar a integração GitHub e confirmar que o deploy de `develop` terminou. O projeto web executa `pnpm build:web` e publica `dist/`; o projeto API constrói `backend/Dockerfile.vercel` como container e define `PORT=8080` em runtime.
2. Criar um projeto Supabase de staging independente em Paris (`eu-west-3`), aplicar as migrações aprovadas e usar apenas contas/dados sintéticos.
3. Configurar os valores de staging nos ambientes Preview dos projetos Vercel. O projeto web recebe `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `EXPO_PUBLIC_SPENDWISE_API_URL`. O projeto API recebe `PORT=8080`, `SUPABASE_ISSUER_URI`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SPENDWISE_CORS_ALLOWED_ORIGINS` com a origem HTTPS exata do web staging e `SPENDWISE_INVITATION_BASE_URL` no domínio web.
4. Manter qualquer `SUPABASE_SERVICE_ROLE_KEY` apenas como variável secreta server-side do projeto API, e só se o fluxo Auth Admin de eliminação a exigir. Nunca a definir no projeto web, em variáveis `EXPO_PUBLIC_*`, ou nos previews com valores de produção.
5. Em GitHub, criar/usar o Environment `staging` e definir as variáveis não secretas `STAGING_WEB_URL` e `STAGING_API_URL` com as origens HTTPS atribuídas aos deployments de staging. Não incluir caminho, credenciais, query string ou fragmento.
6. Configurar o SMTP Brevo, o remetente verificado, os callbacks e os templates no projeto Supabase de staging conforme o [runbook de email Auth](email-auth-brevo.md). Usa apenas destinatários de teste e não reutilizes a SMTP key de produção.

Os passos de criação de projetos, configuração da integração Vercel e introdução de variáveis são ações nos dashboards dos fornecedores; não são efetuados por este repositório. Não ativar faturação nem exceder quotas do plano gratuito aprovado.

## Executar o smoke check

Depois de confirmar que os dois deployments de `develop` estão prontos, abrir **GitHub → Actions → Staging smoke checks → Run workflow** e escolher a branch `develop`.

O job não recebe tokens de utilizador nem chaves Supabase. Verifica:

- a aplicação web responde com HTML;
- `GET /api/v1/health` retorna JSON com estado `UP`;
- o preflight CORS permite a origem web staging e os headers usados pela aplicação;
- `GET /api/v1/budgets` sem token retorna `401` e inclui a origem CORS esperada.

O workflow termina com erro se as URLs não estiverem configuradas, não forem origens HTTPS públicas, se um endpoint falhar, se CORS não corresponder ou se uma rota protegida aceitar pedidos anónimos. Os logs só registam o resultado de cada verificação, sem imprimir respostas ou valores de configuração.

Este smoke check não substitui a aceitação autenticada em staging. Antes do piloto, executar manualmente fluxos com utilizadores sintéticos para registo/login, orçamento partilhado, convite, registo de movimentos, exportação e eliminação; confirmar também políticas Auth, RLS e callbacks no projeto isolado. A validação de backups/restauro tem runbook e gate próprios.
