# SpendWise API

API de domínio do SpendWise, construída com Java 21, Spring Boot 3.5 e Maven.

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
.\mvnw.cmd spring-boot:run
```

Spring Security Resource Server obtém as chaves públicas em `{SUPABASE_ISSUER_URI}/.well-known/jwks.json` e valida assinatura, `iss`, `exp` e `aud=authenticated`; tokens anónimos (`aud=anon`) são recusados. O projeto Supabase deve emitir tokens com uma chave de assinatura publicada no JWKS; uma chave legacy simétrica não satisfaz este fluxo. `GET /api/v1/health` é público; os restantes endpoints exigem Bearer JWT válido. Os erros de autenticação não incluem tokens nem claims na resposta. A API mantém erros técnicos independentes do idioma; a interface deve traduzir os códigos/estados para a língua selecionada pelo utilizador.

Para pedidos autenticados à Data API, a API encaminha o access token JWT recebido para `Authorization: Bearer` e a publishable key para `apikey`. RLS continua a determinar o acesso aos dados; não configurar nem encaminhar uma `service_role` key.

Para executar os testes:

```powershell
.\mvnw.cmd verify
```

O teste opcional `SupabaseDataApiLocalIntegrationTest` comprova a passagem do JWT pelo cliente Java até ao gateway Supabase e o isolamento de perfis via RLS. Para o executar, inicia a stack local em `Database/`, define no processo atual `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SPENDWISE_LOCAL_SUPABASE_ADMIN_KEY` (a `SERVICE_ROLE_KEY` obtida do estado local apenas para criar/apagar utilizadores sintéticos) e corre:

```powershell
.\mvnw.cmd "-Dspendwise.local.supabase=true" "-Dtest=SupabaseDataApiLocalIntegrationTest" test
```

Este teste é opt-in e cria utilizadores `@example.invalid` e perfis sintéticos que são apagados no cleanup. Não usar uma chave de produção nem guardar a chave administrativa em ficheiros.

Cada serviço/use case novo deve ter testes unitários para cenários válidos, inválidos e limites importantes, sem rede nem dependência de contexto Spring. Integração com Supabase/PostgreSQL, RLS e HTTP fica coberta por testes de integração separados. Ver os [princípios de desenvolvimento](../docs/development-principles.md).

O endpoint de disponibilidade é `GET /api/v1/health` e devolve `{"status":"UP"}`. Gestão de orçamento está disponível em `POST/GET /api/v1/budgets`, `GET/PATCH /api/v1/budgets/{budgetId}` e `POST /api/v1/budgets/{budgetId}/archive`. Períodos usam `GET/POST /api/v1/budgets/{budgetId}/periods` e `PATCH /api/v1/budgets/{budgetId}/periods/{periodId}`. Apenas o `OWNER` altera orçamento e períodos; membros ativos podem consultar. Períodos não podem sobrepor-se nem ser editados para excluir datas de movimentos existentes. Orçamentos arquivados continuam a aceitar registos de movimentos pelos membros ativos. O contrato OpenAPI é servido em `/api-docs` e a interface local está em `/api-docs/ui`.

## Limites deste scaffold

A API valida autenticação JWT Supabase e encaminha o JWT original para a Data API. O serviço de autorização por orçamento consulta a membership ativa atual em cada operação: `VIEWER` pode ler, `CONTRIBUTOR` pode ler e registar movimentos, e `OWNER` também pode gerir. A identidade usada no filtro vem do `sub` do JWT validado; não aceitar `user_id` ou papel enviado pelo cliente. Para recursos inexistentes, membros removidos e papéis insuficientes, o serviço lança a mesma negação genérica. A criação do orçamento usa a RPC restrita `create_budget` para inserir orçamento e membership OWNER atomicamente. RLS continua a ser aplicada pela Data API como segunda barreira. Não introduzir `service_role`, ligações privilegiadas à base de dados, segredos ou URLs de ambientes neste repositório.

### Membros de orçamento

`GET /api/v1/budgets/{budgetId}/members` lista membros ativos com `member_id`, papel, data de entrada e nome. O endpoint não devolve `user_id`, email ou telefone. `PATCH /api/v1/budgets/{budgetId}/members/{memberId}/role` altera entre `CONTRIBUTOR` e `VIEWER`; `POST /api/v1/budgets/{budgetId}/members/{memberId}/remove` regista uma remoção sem apagar o histórico. Apenas o `OWNER` gere membros; a alteração de papel ou remoção tem efeito em pedidos seguintes. O `OWNER` não pode ser alterado/removido por este endpoint; transferência de propriedade exige fluxo próprio. O nome vem do perfil; quando ainda não existe perfil, a RPC usa o nome fornecido no registo Auth. A resposta nunca inclui `user_id`, email, telefone ou outros campos do perfil.
