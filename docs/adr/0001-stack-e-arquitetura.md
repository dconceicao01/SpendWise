# ADR 0001: Stack inicial e limites de confiança

- **Estado:** aceite para orientar o MVP; detalhes de fornecedor de hosting/região ainda em aberto.
- **Data:** 2026-11-21

## Contexto

SpendWise é uma aplicação web de registo de poupanças e colaboração. Os utilizadores introduzem valores manualmente; o MVP não inicia pagamentos nem se liga a bancos. Os dados são pessoais e devem ser tratados como confidenciais. O produto precisa de uma API de domínio e de ambientes de teste e produção isolados.

## Decisão

- UI: React + TypeScript + Vite.
- API: Java com Spring Boot, Spring Security Resource Server, REST/OpenAPI e validação JWT Supabase via JWKS.
- Identidade: Supabase Auth.
- Base de dados: PostgreSQL no Supabase, migrações SQL versionadas e RLS.
- A API é a única camada de domínio exposta. A identidade do utilizador chega por JWT verificado; autorização por recurso ocorre na API e é reforçada por RLS.
- O Spring encaminha o JWT original do utilizador à Supabase Data API, com a publishable key, para executar leituras/escritas sob `authenticated` e RLS. Não há ligação JDBC privilegiada para o caminho normal de pedidos; não usar `service_role`/superuser em operações de utilizador.
- GitHub e GitHub Actions para controlo de versão, PR, CI e promoção entre ambientes; Docker para API.
- Supabase local, staging e produção são ambientes independentes. Produção usa região e plano aprovados após avaliação contratual e operacional.
- Lovable é ferramenta opcional de prototipagem/preview. GitHub permanece fonte de verdade. Hosting de produção mantém-se por escolher.

## Consequências

- O frontend é consistente com o fluxo React/Lovable, enquanto regras financeiras e autorização ficam no backend.
- Spring Boot acrescenta manutenção de runtime Java e serviço de API, mas dá estrutura a validação, autorização e regras de domínio.
- A camada de repositório Spring usa chamadas HTTP à Data API; operações que exijam atomicidade entre várias alterações devem ser encapsuladas em RPCs Postgres `SECURITY INVOKER`, com grants/RLS e testes específicos.
- São necessárias migrações e testes SQL para garantir a segurança do schema, especialmente membership e partilha.
- Separar projetos Supabase reduz o risco de testes afetarem produção, mas exige gerir credenciais e migrações por ambiente.
- A escolha de fornecedores não demonstra conformidade RGPD. É necessário completar análise jurídica, DPAs, avaliação de transferências, retenção, AIPD quando aplicável e operação de direitos/incidentes.

## Alternativas consideradas

- **API TypeScript/Edge Functions:** menos serviços, mas o utilizador escolheu Spring Boot e o domínio precisa de regras de servidor estruturadas.
- **Go:** viável, mas não escolhido depois de o utilizador optar por Spring Boot.
- **Acesso direto do browser à base de dados:** rejeitado como via principal, para manter regras de domínio e validações no backend; RLS continua como defesa em profundidade.
- **Chave privilegiada na API:** rejeitada para o percurso normal, porque contorna RLS e amplia o impacto de uma falha de autorização.
- **Lovable como runtime definitivo de produção:** adiado até avaliar requisitos de região, contrato, deployment, secrets, observabilidade, recuperação e rollback.
