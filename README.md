# SpendWise

O SpendWise é uma aplicação multiplataforma de orçamentos por envelopes: cada utilizador define categorias e percentagens para distribuir rendimentos registados e acompanha despesas e saldos virtuais. Orçamentos podem ser individuais ou partilhados. Num orçamento partilhado, os rendimentos de todos os membros alimentam o mesmo fundo comum e são distribuídos pelas categorias e percentagens escolhidas pelo grupo. O produto não movimenta dinheiro nem se liga a bancos: os valores servem apenas para organização e acompanhamento.

> **Estado:** MVP em desenvolvimento para web, Android e iOS. Já existem fluxos de autenticação, orçamentos, alocações, movimentos, partilha e direitos de dados, com testes unitários, integração e CI. Os PRs continuam sujeitos a revisão humana; staging e produção ainda não foram provisionados.

**Períodos do orçamento:** o utilizador define as datas de cada período. Cada período é independente: saldos positivos e negativos ficam no período onde ocorreram e não alteram o saldo inicial do seguinte. Rendimentos, despesas e ajustes ficam associados a um período. As estatísticas anuais podem agregar os movimentos pela data efetiva, mesmo quando um período atravessa dois anos; uma correção de despesa mantém a data e o período originais.

## Produto

### Módulos do MVP

1. **Conta e perfil** — registo, início e saída de sessão, recuperação de acesso, perfil mínimo e eliminação de conta.
2. **Orçamentos** — criação individual ou partilhada, moeda, membros e papéis `OWNER`, `CONTRIBUTOR` e `VIEWER`.
3. **Categorias e alocações** — categorias criadas pelo utilizador e percentagens configuráveis que totalizam 100%; cada rendimento regista um snapshot da distribuição aplicada.
4. **Rendimentos** — registo manual e agendamentos configuráveis pelo utilizador; cada entrada associa-se a um período e, em orçamentos partilhados, integra o fundo comum.
5. **Despesas e ajustes** — movimentos associados ao período e à categoria; ajustes auditáveis preservam o histórico original.
6. **Dashboard** — saldos virtuais por categoria, totais, atividade recente e estatísticas anuais agregadas. “Poupanças” pode ser apenas uma categoria definida pelo utilizador.
7. **Privacidade e suporte** — exportação, correção e pedidos de apagamento de dados, gestão de consentimentos quando aplicável e canal de contacto.

### Fora do MVP

Integração bancária, iniciação de pagamentos, cartões, aconselhamento financeiro, modo empresarial e gamificação avançada. O suporte a web, Android e iOS faz parte do objetivo do produto e será construído sobre uma aplicação universal Expo. Qualquer funcionalidade que passe a iniciar pagamentos ou tratar dados de cartões exige uma nova análise regulatória e de segurança.

## Stack decidida

| Camada              | Tecnologia                                     | Responsabilidade                                                                                                                                            |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicação universal | React Native + Expo + TypeScript + Expo Router | Interface partilhada entre web, Android e iOS; adaptações por plataforma quando necessárias.                                                                |
| API                 | Java + Spring Boot                             | Regras de domínio, autorização por recurso, validação, convites e relatórios.                                                                               |
| Identidade          | Supabase Auth                                  | Registo, sessão, recuperação de acesso e MFA.                                                                                                               |
| Dados               | PostgreSQL gerido pelo Supabase                | Dados de produto, migrações SQL versionadas e RLS. Região Paris (`eu-west-3`), plano Free para desenvolvimento/staging e piloto inicial de baixa afluência. |
| Contrato API        | REST + OpenAPI                                 | Contratos versionados entre React e Spring.                                                                                                                 |
| Entrega             | GitHub + GitHub Actions + Docker               | PRs, CI, publicação em staging e promoção controlada a produção.                                                                                            |

O React chama a API Spring com um access token Supabase. O Spring valida assinatura e claims do JWT através do JWKS do projeto e aplica autorização de negócio. Para ler/escrever dados, o Spring encaminha o JWT original à Supabase Data API, que aplica RLS com a identidade do utilizador; a chave `service_role` não é usada no frontend nem nas operações normais da API. Ver [arquitetura](docs/architecture.md).

Lovable é uma ferramenta opcional de prototipagem e preview, sem usar o backend/Lovable Cloud para o SpendWise. O código versionado no GitHub é a fonte de verdade; a aplicação mantém Expo, Spring Boot e Supabase. Para um piloto pessoal de até cinco pessoas, foi aceite avaliar Vercel Hobby: frontend web estático e API Spring Boot em projetos separados, com Supabase isolado e dados sintéticos. A API usa o runtime de containers Vercel em beta. Esta escolha limita-se ao piloto; hosting de produção continua por decidir. Não publicar dados reais em previews. Ver [configuração do piloto Vercel](docs/vercel-pilot.md).

O Supabase Free em Paris é a escolha para desenvolvimento/staging e um piloto inicial de baixa afluência, não uma garantia de disponibilidade para produção: projetos Free podem pausar após inatividade e não incluem backups geridos. Para recuperação, a meta aprovada é RPO até 24 horas e RTO até 8 horas, com cópias cifradas antes do envio, retenção de 7 dias e armazenamento Cloudflare R2 com jurisdição EU apenas enquanto o uso couber no nível gratuito. Não ativar faturação nem exceder quotas. A recuperação só será considerada validada depois de um exercício que inclua base de dados e Auth.

## Ambientes e entrega

### Estrutura do repositório

O MVP usa um monorepo com aplicações independentes por camada:

- `frontend/` — React Native, Expo, Expo Router e TypeScript para web, Android e iOS; pnpm (Node.js 24 LTS).
- `backend/` — API Java 21 com Spring Boot 4.2.x e Maven Wrapper.
- `Database/` — configuração local Supabase e migrações versionadas (preparação em MVP-06).
- `.github/workflows/` — CI em pull requests e nas branches `develop`/`main`: frontend, backend, Supabase local, migrações/pgTAP, dependências, segredos, configuração e imagem Docker. Deploy continua separado.
- `docs/` — arquitetura, privacidade, fluxo e decisões.

Consultar os READMEs de `frontend/` e `backend/` para os comandos locais. O ambiente Supabase local em `Database/` usa Docker e é tratado na tarefa MVP-06.

- **Local:** frontend, API e Supabase local; dados sintéticos.
- **Staging:** projeto Supabase isolado em Paris, utilizadores de teste e dados sintéticos. Cada PR tem verificações automáticas e preview quando suportado.
- **Piloto:** projeto Supabase isolado em Paris no plano Free, apenas para afluência inicial baixa e com aceitação operacional das pausas/limites do plano; não usar como promessa de SLA.
- **Produção:** projeto Supabase separado, segredos separados, acesso operacional restrito, backups/restauro validados e promoção aprovada; plano e fornecedores devem ser reavaliados antes de escalar.

Não copiar dados de produção para staging. Alterações ao esquema são migrações versionadas e verificadas antes de produção. Ver [fluxo de trabalho](docs/workflow.md).

## Segurança e privacidade

Privacidade por defeito, minimização de dados, autenticação forte, autorização por orçamento, RLS em todas as tabelas expostas, registos sem segredos ou valores desnecessários, gestão de vulnerabilidades, exportação/eliminação e resposta a incidentes fazem parte dos requisitos do produto. Os controlos e as obrigações operacionais estão em [privacidade e segurança](docs/privacy-security.md).

Esta documentação é uma base de engenharia, não um parecer jurídico nem uma declaração de conformidade. Antes do lançamento, o responsável pelo tratamento deve validar base legal por finalidade, avisos de privacidade, prazos de conservação, contratos com subcontratantes, transferências internacionais, necessidade de AIPD/DPO e os direitos dos titulares com apoio jurídico/DPO.

## Documentação

- [Arquitetura, módulos e diagramas](docs/architecture.md)
- [Privacidade, RGPD e segurança](docs/privacy-security.md)
- [Desenvolvimento, revisão, testes e CI/CD](docs/workflow.md)
- [Configuração do piloto Vercel](docs/vercel-pilot.md)
- [Verificações de staging](docs/staging-smoke.md)
- [Builds móveis e suporte Android ARM64](docs/mobile-builds.md)
- [Cópias de segurança e recuperação](docs/disaster-recovery.md)
- [Princípios de desenvolvimento, dependências e testes](docs/development-principles.md)
- [Decisões de arquitetura](docs/adr/0001-stack-e-arquitetura.md)

## Próximos marcos

1. Rever e integrar os PRs da fundação do MVP e concluir a cobertura E2E/acessibilidade.
2. Clarificar e provisionar um ambiente de staging isolado com projeto Supabase próprio e dados sintéticos.
3. Preparar promoção de artefacto validado, rollback/roll-forward, backups e recuperação antes do piloto.

## Equipa de trabalho

Produto/UX, desenvolvimento full-stack, especialista de dados/segurança, **code reviewer** e **tester/QA**. O reviewer e o tester podem ser agentes especializados, mas decisões de acesso a dados, privacidade e produção requerem revisão humana responsável.
