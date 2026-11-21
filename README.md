# SpendWise

O SpendWise é uma aplicação web para organizar objetivos de poupança, acompanhar depósitos e colaborar em poupanças partilhadas. O produto não movimenta dinheiro nem se liga a bancos no MVP: regista valores introduzidos pelos utilizadores.

> **Estado:** documentação de produto e arquitetura inicial. A implementação ainda não começou. As decisões marcadas como “a confirmar” têm de ser fechadas antes da produção.

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

Integração bancária, iniciação de pagamentos, cartões, aconselhamento financeiro, modo empresarial, gamificação avançada e app mobile nativa. Qualquer funcionalidade que passe a iniciar pagamentos ou tratar dados de cartões exige uma nova análise regulatória e de segurança.

## Stack decidida

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Web | React + TypeScript + Vite | Interface responsiva; Lovable pode acelerar protótipos e previews. |
| API | Java + Spring Boot | Regras de domínio, autorização por recurso, validação, convites e relatórios. |
| Identidade | Supabase Auth | Registo, sessão, recuperação de acesso e MFA. |
| Dados | PostgreSQL gerido pelo Supabase | Dados de produto, migrações SQL versionadas e RLS. Região europeia a selecionar e confirmar no projeto. |
| Contrato API | REST + OpenAPI | Contratos versionados entre React e Spring. |
| Entrega | GitHub + GitHub Actions + Docker | PRs, CI, publicação em staging e promoção controlada a produção. |

O React chama a API Spring com um access token Supabase. O Spring valida assinatura e claims do JWT através do JWKS do projeto e aplica autorização de negócio. A API acede aos dados no contexto do utilizador, com políticas RLS como segunda barreira; a chave `service_role` não é usada no frontend nem nas operações normais da API. Ver [arquitetura](docs/architecture.md).

Lovable é uma ferramenta opcional de prototipagem e preview. O código versionado no GitHub é a fonte de verdade. O fornecedor e a região europeia de alojamento para produção continuam por escolher; a decisão tem de incluir DPA, localização de dados, subprocessadores, backups e recuperação. Não publicar dados reais em previews.

## Ambientes e entrega

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
