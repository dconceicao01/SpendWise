# Princípios de desenvolvimento

## Testes

- Frontend Expo: usar Jest com `jest-expo` e React Native Testing Library, evitando testes baseados em detalhes internos de implementação. Executar `pnpm test` sem modo watch em CI e manter testes perto do módulo com sufixo `.test.ts`/`.test.tsx`.
- Testar regras puras, persistência de preferências, limites de segurança e comportamento visível/acessível. Para módulos nativos, mockar somente a fronteira nativa; não substituir a lógica da aplicação no teste.
- Backend: testar regras de domínio e serviços com JUnit/Spring Boot; testar a Data API/RLS e migrations contra Supabase local/fixtures sintéticas. Nunca apontar suites para produção.
- Testes de integração Auth/RLS e execução das migrations continuam a ser fechados na MVP-24/MVP-27; testes E2E e acessibilidade automatizada nas rotas principais pertencem à MVP-25. Testes unitários não substituem esses gates.

Estas regras aplicam-se ao frontend e ao backend. A escolha de uma biblioteca não substitui a validação de privacidade, segurança, acessibilidade ou obrigações legais do produto.

## Dependências e licenças

- Preferir bibliotecas maduras, mantidas, compatíveis com a stack e com histórico de versões e suporte verificável.
- Antes de adicionar uma dependência, confirmar origem, manutenção, avisos de segurança conhecidos, licença SPDX e obrigações das dependências transitivas.
- Preferir licenças permissivas compatíveis com distribuição comercial, como MIT, Apache-2.0, BSD-2-Clause/BSD-3-Clause ou ISC. Licenças copyleft, dual licensing incerto ou licença ausente exigem revisão humana antes de adoção.
- Fixar versões diretas e guardar lockfiles. Atualizações passam por revisão de changelog, compatibilidade e vulnerabilidades.
- CI deve acrescentar análise de composição de software, licenças e vulnerabilidades; gerar SBOM antes da publicação. Um resultado automatizado é evidência de apoio, não parecer jurídico.
- Não afirmar que uma biblioteca torna o produto conforme com RGPD. Finalidade, minimização, base legal, retenção, direitos, contratos, transferências e segurança operacional continuam sob responsabilidade do produto e do responsável pelo tratamento.

## Frontend

- Usar React Native + Expo para web, Android e iOS, com APIs e bibliotecas que suportem explicitamente as plataformas alvo.
- Componentes recebem apenas os parâmetros necessários para o seu propósito. Preferir bons valores por defeito, composição e componentes pequenos a muitos parâmetros booleanos ou configuração genérica.
- Não propagar propriedades através de várias camadas sem necessidade; usar hooks/contexto apenas quando há estado realmente partilhado.
- Manter regras de negócio e formatação complexa fora da apresentação. A API continua a ser autoridade para validação, cálculos, identidade e autorização.
- Componentes devem tratar acessibilidade, estados de carregamento/vazio/erro e layouts adaptáveis às plataformas.

## Backend

- Organizar o código por módulo de domínio/funcionalidade, com fronteiras claras. Controllers HTTP ficam finos; serviços/use cases coordenam operações; regras de negócio ficam em unidades puras e testáveis; persistência e integrações ficam atrás de adapters/repositórios.
- Serviços não devem depender de contexto Spring para executar regras que possam ser testadas como lógica normal de Java.
- Cada serviço/use case novo deve ter testes unitários determinísticos para caminhos válidos, inválidos e limites relevantes. Não depender de rede, Supabase ou relógio real em testes unitários.
- Cobrir integração Spring, PostgreSQL, RLS e contratos em testes de integração separados. Testes unitários não substituem esses testes de segurança.
- Preferir tipos explícitos, validação à entrada, erros de domínio claros e transações apenas onde o caso de uso exige atomicidade.

## Contratos, dados e segurança

- Rever o contrato OpenAPI de uma funcionalidade antes de implementar o frontend e o backend em paralelo. Não introduzir geração automática de clientes sem avaliar tipos, compatibilidade multiplataforma e manutenção.
- Aplicar negação por defeito e privilégio mínimo. Cada política RLS deve ter casos de teste permitidos e negados para utilizador anónimo, owner, contributor, viewer e utilizador sem pertença, conforme a operação.
- Migrações são append-only depois de aplicadas. Alterações de produção seguem expand/contract para permitir que versões antigas e novas da API convivam durante a promoção.
- Logs estruturados incluem contexto técnico e correlação, mas omitem tokens, e-mails, IDs pessoais e valores financeiros salvo necessidade documentada e aprovada.
- Acessibilidade é critério de aceitação: semântica e navegação por teclado na web; leitor de ecrã, áreas de toque e convenções nativas em Android/iOS.
- Manter testes unitários rápidos e determinísticos, testes de integração nos limites de persistência/segurança e um conjunto pequeno de fluxos E2E críticos. Não usar E2E para substituir testes de autorização ou de domínio.

## Pull requests

Cada PR declara dependências/licenças novas, impacto em dados pessoais, decisões de segurança e os comandos de validação executados. Código de autorização, migrações, Auth ou RLS precisa de revisão independente e evidência de testes positivos e negativos.
