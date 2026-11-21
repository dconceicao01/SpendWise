# SpendWise API

API de domínio do SpendWise, construída com Java 21, Spring Boot 3.5 e Maven.

## Pré-requisitos

- JDK 21 instalado e disponível como `java`;
- acesso à internet na primeira execução do Maven Wrapper, para descarregar o Maven e as dependências.

## Executar localmente

No PowerShell, a partir de `backend/`:

```powershell
.\mvnw.cmd spring-boot:run
```

Para executar os testes:

```powershell
.\mvnw.cmd verify
```

Cada serviço/use case novo deve ter testes unitários para cenários válidos, inválidos e limites importantes, sem rede nem dependência de contexto Spring. Integração com Supabase/PostgreSQL, RLS e HTTP fica coberta por testes de integração separados. Ver os [princípios de desenvolvimento](../docs/development-principles.md).

O endpoint de disponibilidade é `GET /api/v1/health` e devolve `{"status":"UP"}`. O contrato OpenAPI é servido em `/api-docs` e a interface local está em `/api-docs/ui`.

## Limites deste scaffold

Ainda não existem autenticação, autorização, persistência, integração Supabase nem regras de domínio. Quando forem implementadas, a API validará JWTs do Supabase por JWKS e usará o JWT do utilizador para chamadas à Data API sob RLS. Não introduzir `service_role`, ligações privilegiadas à base de dados, segredos ou URLs de ambientes neste repositório.
