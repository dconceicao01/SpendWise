# Equipa de agentes SpendWise

## Modelo de trabalho

O responsável pelo produto é o Duarte. Os agentes podem preparar opções, requisitos verificáveis, implementação e revisões, mas não fecham decisões de produto, interpretações jurídicas, escolha de fornecedores/região, políticas de dados ou alterações estruturais sem validação do responsável.

O backlog oficial está na [lista MVP do Slack](https://dcorggrupo.slack.com/lists/T0CLPGK1GG0/F0CKQ0T30A1). As colunas **Agente responsável** e **Modelo atribuído** indicam a função operacional e o modelo planeado. Os agentes Codex não são utilizadores Slack; a atribuição é registada como texto na lista.

## Papéis

| Papel | Modelo operacional | Responsabilidades |
|---|---|---|
| Product Owner | Duarte (humano) | Aprovar regras de negócio, prioridades, funcionalidades e decisões de produto. |
| Tech Lead / Platform | Codex, GPT-5.6-Terra | Coordenar dependências, propor decisões técnicas e preparar fundação, CI/CD e operação. Pedir aprovação para escolhas estruturais em aberto. |
| Frontend Engineer | Codex, GPT-6-Luna; Ollama `qwen3.5:4b` como modelo local pretendido | React, TypeScript, UX, acessibilidade e integração com a API. O modelo Ollama ainda não está ligado à execução destes agentes. |
| Backend Engineer | Codex, GPT-5.6-Terra; Ollama `gpt-oss:20b` apenas após avaliação de memória | Spring Boot, contratos API, domínio, autenticação e autorização. O modelo local de 20B é pesado para 16 GB de RAM e não é o executor ativo. |
| Security & Privacy Reviewer | Codex, GPT-5.6-Terra | Revisão independente de auth, autorização, RLS, segredos, logs, privacidade e ameaças. Não substitui DPO/jurista nem aprovação humana. |
| QA / Tester | Codex, GPT-6-Luna; Ollama `deepseek-r1:8b` para apoio a cenários | Estratégia de testes, casos negativos, acessibilidade, evidência de execução e validação de critérios. O modelo local ainda não está ligado à execução dos agentes. |

## Limites de execução de modelos

Nesta equipa Codex, os subagentes disponíveis herdam o fornecedor OpenAI da sessão e não podem ser encaminhados diretamente ao endpoint Ollama. Os modelos locais indicados são alvos para uma futura sessão/runtime separado; não serão apresentados como agentes ativos até existir uma ligação operacional. `nomic-embed-text` é reservado a embeddings, não a programação. Para o hardware atual (16 GB RAM, 8 GB VRAM), privilegiar `qwen3.5:4b` e executar modelos de 8B um de cada vez; evitar `gpt-oss:20b` como agente diário.

## Atribuição do backlog

- **Produto:** MVP-01 fica sob responsabilidade do Duarte; o agente de produto prepara a lista de decisões sem escolher por ele.
- **Privacidade e fornecedores:** MVP-02 e MVP-03 ficam com Security & Privacy para preparar mapa/checklist e opções; decisões legais e de fornecedor aguardam aprovação humana.
- **Fundação e operação:** MVP-05, MVP-06, MVP-27, MVP-28 e MVP-29 ficam com Tech Lead / Platform, condicionados às decisões estruturais necessárias.
- **Frontend e UX:** MVP-04, MVP-09, MVP-18, MVP-19 e MVP-20 ficam com Frontend Engineer.
- **Domínio e API:** MVP-07, MVP-10, MVP-12, MVP-13, MVP-14, MVP-15, MVP-16 e MVP-17 ficam com Backend Engineer.
- **Segurança e privacidade no produto:** MVP-08, MVP-11, MVP-22, MVP-23 e MVP-30 ficam com Security & Privacy Reviewer, em colaboração com Backend/Platform.
- **QA e release:** MVP-24, MVP-25, MVP-26 e MVP-31 ficam com QA / Tester; MVP-31 requer aprovação humana e revisão jurídica/operacional.
- **Dashboard:** MVP-19 fica com Frontend, com cálculos e autorização validados pelo Backend.
- **MVP-21 (exportação):** Backend implementa; Security & Privacy revê minimização e autorização.

## Aprovações e fluxo

1. Agente analisa a tarefa e identifica decisões pendentes antes de alterar estrutura, modelo de dados, autenticação, autorização, fornecedor ou comportamento do produto.
2. Decisões importantes são apresentadas ao Duarte com opções e impacto; o trabalho dependente aguarda resposta.
3. Implementações usam tarefas do Slack, branches/PRs curtas, revisão independente e QA. Nenhum agente aprova o próprio trabalho.
4. Segurança, privacidade, produção e questões legais mantêm aprovação humana responsável.

## Relatórios de progresso

Cada atualização ao Duarte deve seguir formato de release notes: **feito**, **evidência/ficheiros**, **validação**, **bloqueios/decisões pendentes** e **próximo passo**. Não declarar testes executados sem os executar.
