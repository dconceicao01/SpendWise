# SpendWise API

API de domínio do SpendWise, construída com Java 21, Spring Boot 4.2 e Maven. A linha 4 usa Jackson 3; manter as anotações Jackson core em `com.fasterxml.jackson.annotation` e as anotações de databind em `tools.jackson.databind.annotation`.

## Pré-requisitos

- JDK 21 instalado e disponível como `java`;
- acesso à internet na primeira execução do Maven Wrapper, para descarregar o Maven e as dependências.

## Executar localmente

Configura `SUPABASE_ISSUER_URI` com o issuer do projeto Supabase Auth, por exemplo `http://127.0.0.1:54321/auth/v1` para o Supabase local, sem `/` no fim. A aplicação não arranca sem um issuer explícito, evitando iniciar acidentalmente com uma configuração de identidade indefinida. O valor é uma URL de configuração, não uma chave secreta.

No PowerShell, a partir de `backend/`:

```powershell
$env:SUPABASE_ISSUER_URI = "http://127.0.0.1:54321/auth/v1"
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_PUBLISHABLE_KEY = "<chave publishable do projeto>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<chave secreta apenas no servidor>"
.\mvnw.cmd spring-boot:run
```

Spring Security Resource Server obtém as chaves públicas em `{SUPABASE_ISSUER_URI}/.well-known/jwks.json` e valida assinatura, `iss`, `exp` e `aud=authenticated`; tokens anónimos (`aud=anon`) são recusados. O projeto Supabase deve emitir tokens com uma chave de assinatura publicada no JWKS; uma chave legacy simétrica não satisfaz este fluxo. `GET /api/v1/health` é público; os restantes endpoints exigem Bearer JWT válido. Os erros de autenticação não incluem tokens nem claims na resposta. A API mantém erros técnicos independentes do idioma; a interface deve traduzir os códigos/estados para a língua selecionada pelo utilizador.

CORS está limitado por omissão às origens locais `http://localhost:8081` e `http://127.0.0.1:8081`. Em staging/produção, define `SPENDWISE_CORS_ALLOWED_ORIGINS` como lista separada por vírgulas de origens HTTPS exatas (scheme, host e porta quando aplicável), por exemplo `https://app.example.com`; não usar `*`. A API não aceita credenciais por cookies e permite apenas os métodos/headers usados pelo cliente. O hosting do frontend deve configurar CSP e restantes cabeçalhos HTTP no documento web, uma vez que estes cabeçalhos não são efetivos quando enviados pela API.

Para pedidos autenticados à Data API, a API encaminha o access token JWT recebido para `Authorization: Bearer` e a publishable key para `apikey`. RLS continua a determinar o acesso aos dados. `SUPABASE_SERVICE_ROLE_KEY` só é usada pelo endpoint de eliminação para a chamada Auth Admin, depois de a limpeza transacional de dados terminar; nunca a configurar no frontend nem em pedidos normais.

Para executar os testes:

```powershell
.\mvnw.cmd verify
```

Para construir a imagem do container localmente, a partir de `backend/`:

```powershell
docker build -t spendwise-api:local .
```

A imagem usa Java 21 JRE e executa como utilizador sem privilégios. A CI constrói a imagem e verifica vulnerabilidades altas/críticas; a imagem ainda não é publicada nem implantada por este workflow.

### Piloto pessoal na Vercel (opcional)

A Vercel pode alojar o piloto pessoal através de dois projetos independentes: um para o frontend web estático e outro para a API Spring Boot. A API usa o runtime de containers da Vercel, que está em beta. O projeto da API deve usar `backend/` como diretório raiz; o ficheiro `Dockerfile.vercel` usa o mesmo build Java 21 da imagem local. A aplicação escuta a porta indicada por `PORT` (predefinição 8080 nesta configuração).

No projeto da API, selecionar a região Paris (`cdg1`) e definir apenas no ambiente server-side: `SUPABASE_ISSUER_URI`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SPENDWISE_CORS_ALLOWED_ORIGINS` e `SPENDWISE_INVITATION_BASE_URL`. A origem CORS e a URL de convite devem corresponder exatamente ao domínio do projeto web e usar HTTPS. O projeto web recebe `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `EXPO_PUBLIC_SPENDWISE_API_URL` como variáveis de build. Nunca colocar a chave `service_role` em variáveis `EXPO_PUBLIC_*`, no frontend ou em previews.

O projeto web deve usar a raiz `frontend/`, instalar com pnpm 12.20 e Node.js 24, executar `pnpm build:web` e publicar `dist/`. Configurar os URLs de redirecionamento do Supabase Auth para o domínio de piloto e os callbacks realmente usados. Usar um projeto Supabase separado, com contas e dados sintéticos; nunca apontar previews para dados reais. Hobby só é adequado ao uso pessoal não comercial, sem SLA; containers escalam a zero e têm quotas/faturação próprias. Rever limites e termos antes de qualquer utilização fora do piloto. Esta configuração não constitui autorização para produção.

## Exportação de dados pessoais

`GET /api/v1/me/export` exige um Bearer JWT válido e devolve um anexo `application/json` chamado `spendwise-data-export.json`. Inclui o email do próprio JWT e os dados do perfil próprio; para cada orçamento visível ao utilizador, inclui configuração, períodos, categorias, versões de alocação, rendimentos, despesas, ajustes e agendamentos. As listas são paginadas internamente até ao fim. Em orçamentos partilhados, a exportação respeita exatamente a visibilidade atual via Data API/RLS e omite os identificadores que indicam qual membro criou cada movimento/agendamento. A resposta usa `Cache-Control: no-store`; o cliente deve guardar o ficheiro apenas onde o utilizador escolher.

`GET` e `PUT /api/v1/me/profile` consultam e atualizam o perfil do utilizador atual. Nome e moeda (código de três letras maiúsculas) são obrigatórios; telefone E.164 é opcional. O email vem do JWT Auth e não é alterado por este endpoint. Respostas não são guardadas em cache.

`GET /api/v1/me/deletion-options` devolve apenas os orçamentos partilhados onde a pessoa atual é OWNER e os membros ativos elegíveis para receber cada orçamento. `POST /api/v1/me/deletion` recebe `{"ownerTransfers":[{"budgetId":"…","targetMemberId":"…"}]}`. Para cada orçamento partilhado em que a pessoa é OWNER, é obrigatório indicar um membro ativo para receber a propriedade. A RPC deriva a identidade de `auth.uid()`, valida todas as transferências, apaga os orçamentos pessoais, revoga convites abertos, remove preferências de lembretes, pausa agendamentos que perdem um criador elegível, remove o perfil e pseudonimiza as memberships partilhadas numa única transação. A aplicação só chama Auth Admin após essa transação. Se Auth Admin estiver indisponível, a tabela privada de pedidos pendentes bloqueia nova leitura/escrita do utilizador e permite repetir o pedido depois de corrigida a configuração. A eliminação Auth remove a identidade e impede novas sessões; JWTs já emitidos podem permanecer criptograficamente válidos até expirarem, mas as policies e helpers da base de dados bloqueiam a conta pendente e a membership é removida antes da chamada Admin. Ver [política de dados e migração](../Database/README.md).

O teste opcional `SupabaseDataApiLocalIntegrationTest` comprova a passagem do JWT pelo cliente Java até ao gateway Supabase e o isolamento de perfis via RLS. Para o executar, inicia a stack local em `Database/`, define no processo atual `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SPENDWISE_LOCAL_SUPABASE_ADMIN_KEY` (a `SERVICE_ROLE_KEY` obtida do estado local apenas para criar/apagar utilizadores sintéticos) e corre:

```powershell
.\mvnw.cmd "-Dspendwise.local.supabase=true" "-Dtest=SupabaseDataApiLocalIntegrationTest" test
```

Este teste é opt-in e cria utilizadores `@example.invalid` e perfis sintéticos que são apagados no cleanup. Não usar uma chave de produção nem guardar a chave administrativa em ficheiros.

Cada serviço/use case novo deve ter testes unitários para cenários válidos, inválidos e limites importantes, sem rede nem dependência de contexto Spring. Integração com Supabase/PostgreSQL, RLS e HTTP fica coberta por testes de integração separados. Ver os [princípios de desenvolvimento](../docs/development-principles.md).

O endpoint de disponibilidade é `GET /api/v1/health` e devolve `{"status":"UP"}`. Gestão de orçamento está disponível em `POST/GET /api/v1/budgets`, `GET/PATCH /api/v1/budgets/{budgetId}` e `POST /api/v1/budgets/{budgetId}/archive`. Períodos usam `GET/POST /api/v1/budgets/{budgetId}/periods` e `PATCH /api/v1/budgets/{budgetId}/periods/{periodId}`. Categorias usam `GET/POST /api/v1/budgets/{budgetId}/categories`, `PATCH /api/v1/budgets/{budgetId}/categories/{categoryId}` e `POST .../{categoryId}/archive`. Versões de alocação usam `GET/POST /api/v1/budgets/{budgetId}/allocation-sets`, `PUT .../{allocationSetId}/items` e `POST .../{allocationSetId}/activate`. Os pedidos de alocação recebem percentagens de 0 a 100 com até duas casas decimais; a soma exata de 100% é validada na ativação. Só o `OWNER` altera orçamento, períodos, categorias e alocações; membros ativos consultam. Períodos não se sobrepõem nem podem ser editados para excluir datas de movimentos existentes. Uma categoria só pode ser arquivada depois de removida da alocação ativa. Orçamentos arquivados continuam a aceitar registos de movimentos pelos membros ativos. O contrato OpenAPI é servido em `/api-docs` e a interface local está em `/api-docs/ui`.

### Rendimentos, despesas e ajustes

Movimentos usam `GET/POST /api/v1/budgets/{budgetId}/incomes`, `GET/POST .../expenses` e `GET/POST .../adjustments`. As listagens aceitam `periodId` opcional, `limit` (máximo 100) e `offset`. Cada escrita exige papel `OWNER` ou `CONTRIBUTOR`; o membro que regista é sempre derivado do JWT atual, não do corpo do pedido. O registo de rendimento chama `record_income` numa transação e devolve o snapshot das percentagens e montantes da versão ativa no momento do registo. Rendimentos retroativos usam essa versão ativa, mas mantêm a data efetiva e o período selecionado. Despesas e ajustes usam RPCs `SECURITY INVOKER`; a base de dados valida autorização, período e consistência. Um ajuste ligado a uma despesa corrigida tem de preservar a data efetiva, categoria e período originais. São registos virtuais para acompanhamento; não movimentam dinheiro.

As escritas autenticadas são limitadas no PostgreSQL a 120 transações por utilizador em janela móvel de 60 segundos; várias linhas alteradas numa transação só contam uma vez. Quando o limite é atingido, a API devolve HTTP 429 sem incluir o detalhe interno da base de dados. Registos técnicos do limite não contêm IP nem payload e são removidos após 24 horas.

## Limites deste scaffold

A API valida autenticação JWT Supabase e encaminha o JWT original para a Data API. O serviço de autorização por orçamento consulta a membership ativa atual em cada operação: `VIEWER` pode ler, `CONTRIBUTOR` pode ler e registar movimentos, e `OWNER` também pode gerir. A identidade usada no filtro vem do `sub` do JWT validado; não aceitar `user_id` ou papel enviado pelo cliente. Para recursos inexistentes, membros removidos e papéis insuficientes, o serviço lança a mesma negação genérica. A criação do orçamento usa a RPC restrita `create_budget` para inserir orçamento e membership OWNER atomicamente. RLS continua a ser aplicada pela Data API como segunda barreira. Não introduzir `service_role`, ligações privilegiadas à base de dados, segredos ou URLs de ambientes neste repositório.

### Membros de orçamento

`GET /api/v1/budgets/{budgetId}/members` lista membros ativos com `member_id`, papel, data de entrada e nome. O endpoint não devolve `user_id`, email ou telefone. `PATCH /api/v1/budgets/{budgetId}/members/{memberId}/role` altera entre `CONTRIBUTOR` e `VIEWER`; `POST /api/v1/budgets/{budgetId}/members/{memberId}/remove` regista uma remoção sem apagar o histórico. Apenas o `OWNER` gere membros; a alteração de papel ou remoção tem efeito em pedidos seguintes. O `OWNER` não pode ser alterado/removido por este endpoint; transferência de propriedade exige fluxo próprio. O nome vem do perfil; quando ainda não existe perfil, a RPC usa o nome fornecido no registo Auth. A resposta nunca inclui `user_id`, email, telefone ou outros campos do perfil.

### Convites de orçamento

`GET/POST /api/v1/budgets/{budgetId}/invitations` lista metadados ou cria um convite para `CONTRIBUTOR`/`VIEWER`; apenas o `OWNER` pode gerir convites. A criação devolve o link secreto uma única vez e o trigger de base de dados limita a 10 convites por orçamento por hora, inclusive quando se usa a Data API diretamente. O segredo tem 256 bits aleatórios, só o SHA-256 é guardado e o token segue no fragmento `#token=` para não aparecer nos pedidos HTTP nem nos logs do servidor. Os convites expiram após 7 dias por predefinição; `SPENDWISE_INVITATION_TTL` aceita uma duração ISO-8601 positiva até 30 dias. `POST /api/v1/invitations/accept` aceita JSON `{"token":"..."}` e exige sessão autenticada com email confirmado igual ao endereço convidado. `POST /api/v1/budgets/{budgetId}/invitations/{invitationId}/revoke` revoga um convite ainda pendente. Respostas de token ausente, expirado, revogado, usado, email diferente ou não confirmado são genéricas. A RPC `accept_budget_invitation` cria membership e consome o convite atomicamente e aplica 5 tentativas por utilizador em 15 minutos, sem guardar IP. Email do convite é eliminado na aceitação/revogação; convites expirados são apagados 30 dias após a expiração por um job horário. Configura `SPENDWISE_INVITATION_BASE_URL` para a rota pública de aceitação em cada ambiente; exige HTTPS em staging e produção. O valor local predefinido é `http://localhost:8081/invitations/accept`.
