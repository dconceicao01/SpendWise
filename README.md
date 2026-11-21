# SpendWise

O SpendWise é uma aplicação multiplataforma para organizar objetivos de poupança, acompanhar depósitos e colaborar em poupanças partilhadas. O produto não movimenta dinheiro nem se liga a bancos no MVP: regista valores introduzidos pelos utilizadores.

> **Estado:** scaffold técnico inicial para web, Android e iOS. Os fluxos funcionais e as decisões marcadas como “a confirmar” têm de ser fechados antes da produção.

## Produto

### Módulos do MVP

1. **Conta e perfil** — registo, início e saída de sessão, recuperação de acesso, perfil mínimo e eliminação de conta.
2. **Poupanças** — criação, edição, arquivo/eliminação, objetivo opcional, moeda, privacidade e frequência pretendida.
3. **Categorias e alocações** — categorias por poupança e distribuição percentual que totaliza 100%; cada depósito guarda uma cópia dos valores usados naquele momento.
4. **Partilha** — convites, membros e permissões `OWNER`, `CONTRIBUTOR` e `VIEWER`; cada membro só vê os dados a que a poupança partilhada lhe dá acesso.
5. **Depósitos e histórico** — registo manual, histórico cronológico e relatórios. Depósitos “recorrentes” são lembretes no MVP, não débitos bancários automáticos.
6. **Dashboard** — saldos registados, progresso de objetivos, contribuições e atividade recente.
7. **Privacidade e suporte** — exportação, correção e pedidos de apagamento de dados, gestão de consentimentos quando aplicável e canal de contacto.

### Fora do MVP

Integração bancária, iniciação de pagamentos, cartões, aconselhamento financeiro, modo empresarial e gamificação avançada. O suporte a web, Android e iOS faz parte do objetivo do produto e será construído sobre uma aplicação universal Expo. Qualquer funcionalidade que passe a iniciar pagamentos ou tratar dados de cartões exige uma nova análise regulatória e de segurança.

## Stack decidida

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Aplicação universal | React Native + Expo + TypeScript + Expo Router | Interface partilhada entre web, Android e iOS; adaptações por plataforma quando necessárias. |
| API | Java + Spring Boot | Regras de domínio, autorização por recurso, validação, convites e relatórios. |
| Identidade | Supabase Auth | Registo, sessão, recuperação de acesso e MFA. |
| Dados | PostgreSQL gerido pelo Supabase | Dados de produto, migrações SQL versionadas e RLS. Região europeia a selecionar e confirmar no projeto. |
| Contrato API | REST + OpenAPI | Contratos versionados entre React e Spring. |
| Entrega | GitHub + GitHub Actions + Docker | PRs, CI, publicação em staging e promoção controlada a produção. |

O React chama a API Spring com um access token Supabase. O Spring valida assinatura e claims do JWT através do JWKS do projeto e aplica autorização de negócio. Para ler/escrever dados, o Spring encaminha o JWT original à Supabase Data API, que aplica RLS com a identidade do utilizador; a chave `service_role` não é usada no frontend nem nas operações normais da API. Ver [arquitetura](docs/architecture.md).

Lovable é uma ferramenta opcional de prototipagem e preview. O código versionado no GitHub é a fonte de verdade. O fornecedor e a região europeia de alojamento para produção continuam por escolher; a decisão tem de incluir DPA, localização de dados, subprocessadores, backups e recuperação. Não publicar dados reais em previews.

## Ambientes e entrega

### Estrutura do repositório

O MVP usa um monorepo com aplicações independentes por camada:

- `frontend/` — React Native, Expo, Expo Router e TypeScript para web, Android e iOS; pnpm (Node.js 24 LTS).
- `backend/` — API Java 21 com Spring Boot 3.5.x e Maven Wrapper.
- `Database/` — configuração local Supabase e migrações versionadas (preparação em MVP-06).
- `.github/workflows/` — CI de validação em pull requests, a criar na tarefa MVP-27; deploy fica fora do primeiro scaffold.
- `docs/` — arquitetura, privacidade, fluxo e decisões.

Consultar os READMEs de `frontend/` e `backend/` para os comandos locais. O ambiente Supabase local em `Database/` usa Docker e é tratado na tarefa MVP-06.

- **Local:** frontend, API e Supabase local; dados sintéticos.
- **Staging:** projeto Supabase isolado, utilizadores de teste e dados sintéticos. Cada PR tem verificações automáticas e preview quando suportado.
- **Produção:** projeto Supabase separado, segredos separados, acesso operacional restrito, backups e promoção aprovada.

Não copiar dados de produção para staging. Alterações ao esquema são migrações versionadas e verificadas antes de produção. Ver [fluxo de trabalho](docs/workflow.md).

## Segurança e privacidade

Privacidade por defeito, minimização de dados, autenticação forte, autorização por poupança, RLS em todas as tabelas expostas, registos sem segredos ou valores financeiros desnecessários, gestão de vulnerabilidades, exportação/eliminação e resposta a incidentes fazem parte dos requisitos do produto. Os controlos e as obrigações operacionais estão em [privacidade e segurança](docs/privacy-security.md).

Esta documentação é uma base de engenharia, não um parecer jurídico nem uma declaração de conformidade. Antes do lançamento, o responsável pelo tratamento deve validar base legal por finalidade, avisos de privacidade, prazos de conservação, contratos com subcontratantes, transferências internacionais, necessidade de AIPD/DPO e os direitos dos titulares com apoio jurídico/DPO.

## Documentação

- [Arquitetura, módulos e diagramas](docs/architecture.md)
- [Privacidade, RGPD e segurança](docs/privacy-security.md)
- [Desenvolvimento, revisão, testes e CI/CD](docs/workflow.md)
- [Decisões de arquitetura](docs/adr/0001-stack-e-arquitetura.md)

## Roadmap inicial

1. Validar modelo de domínio, partilha e permissões.
2. Criar projetos Supabase local/staging/produção e migrações RLS testadas.
3. Construir autenticação, poupanças, categorias e depósitos.
4. Construir partilha, dashboard, exportação e eliminação de conta.
5. Completar avaliação de privacidade, segurança, recuperação e operação antes do lançamento.

## Equipa de trabalho

Produto/UX, desenvolvimento full-stack, especialista de dados/segurança, **code reviewer** e **tester/QA**. O reviewer e o tester podem ser agentes especializados, mas decisões de acesso a dados, privacidade e produção requerem revisão humana responsável.
