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
.\mvnw.cmd spring-boot:run
```

Spring Security Resource Server obtém as chaves públicas em `{SUPABASE_ISSUER_URI}/.well-known/jwks.json` e valida assinatura, `iss`, `exp` e `aud=authenticated`; tokens anónimos (`aud=anon`) são recusados. O projeto Supabase deve emitir tokens com uma chave de assinatura publicada no JWKS; uma chave legacy simétrica não satisfaz este fluxo. `GET /api/v1/health` é público; os restantes endpoints exigem Bearer JWT válido. Os erros de autenticação não incluem tokens nem claims na resposta. A API mantém erros técnicos independentes do idioma; a interface deve traduzir os códigos/estados para a língua selecionada pelo utilizador.

Para executar os testes:

```powershell
.\mvnw.cmd verify
```

Cada serviço/use case novo deve ter testes unitários para cenários válidos, inválidos e limites importantes, sem rede nem dependência de contexto Spring. Integração com Supabase/PostgreSQL, RLS e HTTP fica coberta por testes de integração separados. Ver os [princípios de desenvolvimento](../docs/development-principles.md).

O endpoint de disponibilidade é `GET /api/v1/health` e devolve `{"status":"UP"}`. O contrato OpenAPI é servido em `/api-docs` e a interface local está em `/api-docs/ui`.

## Limites deste scaffold

A API valida autenticação JWT Supabase, mas ainda não implementa autorização por membership, persistência, integração à Data API nem regras de domínio. Nas tarefas seguintes, a API usará o JWT do utilizador nas chamadas à Data API sob RLS. Não introduzir `service_role`, ligações privilegiadas à base de dados, segredos ou URLs de ambientes neste repositório.
