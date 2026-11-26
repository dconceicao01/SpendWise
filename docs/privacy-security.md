# Privacidade, RGPD e segurança

## Princípio de implementação

O SpendWise trata dados de conta e informação sobre hábitos de orçamento e valores registados. Tratar estes dados como confidenciais, mesmo sem integração bancária. Aplicar minimização, finalidade explícita, privacidade por defeito, controlo de acesso e segurança desde a conceção.

Esta página traduz requisitos em controlos de produto e engenharia; não certifica conformidade. A entidade que operar o serviço tem de identificar o responsável pelo tratamento, finalidades e bases legais, informar as pessoas, estabelecer contratos, atender direitos e avaliar riscos reais. Obter revisão jurídica/DPO antes de produção.

## Matriz de controlo

| Área | Requisito de produto/engenharia | Evidência antes de produção |
|---|---|---|
| Finalidade e base legal | Registar finalidade e base legal para cada operação. Consentimento é usado quando essa é a base adequada e deve ser específico, informado e revogável; não marcar todo o tratamento como “consentimento”. | Registo de atividades, mapa de dados, avisos e consentimentos versionados. |
| Minimização e privacidade por defeito | Recolher e-mail e nome obrigatório; telefone é opcional e apenas necessário se for usado para MFA por SMS. Orçamentos são privados por defeito; partilha só após convite aceite; email do destinatário de convite é removido após aceitação/revogação e convites expirados são apagados 30 dias depois; não pedir morada, dados bancários ou cartões no MVP sem finalidade aprovada. | Inventário de campos, definições de privacidade, rotina `pg_cron` e revisão dos ecrãs/formulários. |
| Transparência | Informar identidade/contacto do responsável, finalidades, bases legais, destinatários/subprocessadores, transferências, prazos de retenção, direitos e como reclamar junto da autoridade competente. | Aviso de privacidade revisto juridicamente e acessível no registo e na aplicação. |
| Direitos das pessoas | Fluxo autenticado para acesso/exportação, retificação, apagamento, limitação/oposição quando aplicáveis e retirada de consentimento; verificar identidade de modo proporcional e registar atendimento. Ao apagar conta, eliminar orçamento pessoal em transação ordenada; nos partilhados, transferir propriedade quando necessário, retirar membership e pseudonimizar autoria, preservando o histórico comum acordado. Só depois remover a identidade Auth. Dados pseudonimizados continuam sujeitos a avaliação de finalidade e retenção. | Testes de exportação/eliminação, procedimento operacional, SLA interno e registo de pedidos. |
| Retenção | Definir prazo por categoria de dados e finalidade. Eliminar ou anonimizar quando já não necessário; documentar exceções legais. Definir quando cópias de segurança expiram e o que significa eliminação nelas. | Tabela de retenção aprovada, tarefas de limpeza e teste de restauro/expiração. |
| Segurança (Art. 32) | Criptografia em trânsito, cifragem em repouso fornecida pelo serviço e verificada no plano contratado, RBAC/RLS, MFA para operadores, segredos rotacionáveis, patching, revisão, testes e recuperação. | Threat model, resultados de testes, configuração e plano de continuidade. |
| Subcontratantes e transferências | Rever DPA, subprocessadores, suporte, localização de dados/backups e mecanismo de transferência internacional de cada fornecedor. A preferência por região UE não substitui esta avaliação. | Inventário de fornecedores, DPAs e avaliação de transferências/contratos. |
| Incidentes | Plano para detetar, conter, investigar, preservar evidência, avaliar risco, documentar decisões e comunicar. O responsável notifica a autoridade quando exigido, sem demora injustificada e, quando viável, até 72 horas após conhecimento; alto risco pode exigir comunicação aos titulares. | Runbook, responsáveis e contactos, exercício de tabletop e modelo de registo. |
| AIPD/DPO | Avaliar e documentar se o tratamento é suscetível de alto risco e se é necessária AIPD; avaliar nomeação de DPO conforme critérios legais, sem assumir que é sempre obrigatória. | Avaliação assinada pelo responsável e consulta jurídica/DPO. |
| Cookies e métricas | Não instalar analytics/publicidade não essencial antes de avaliar consentimento e obrigações ePrivacy. Preferir métricas agregadas sem identificadores quando possível. | Inventário de cookies/SDKs e mecanismos de consentimento aplicáveis. |
| Cartões/pagamentos | MVP não processa cartões nem inicia pagamentos. Rever PCI DSS e regulação de serviços de pagamento se o âmbito mudar; não declarar “não aplicável” sem confirmar fluxo real e responsabilidades. | Escopo de dados/fluxos revisto a cada nova integração. |

## Modelo de autorização

- Cada tabela em schema exposto tem RLS ativa, grants mínimos e políticas `SELECT`, `INSERT`, `UPDATE` e `DELETE` definidas por modelo de ameaça.
- A API valida o JWT Supabase e faz autorização do recurso; RLS aplica uma segunda barreira por `auth.uid()` e pertença a `budget_members`.
- A ligação de dados opera com claims verificados e contexto de transação `authenticated` ou passa o JWT à Data API. Testar que contexto não vaza entre conexões pooled. **Não** operar pedidos comuns com `service_role`, superuser ou papel que contorne RLS.
- `OWNER`, `CONTRIBUTOR`, `VIEWER` são papéis locais ao orçamento. Guardar a relação no banco e validar sempre o papel atual; não confiar em role fornecida pelo cliente nem em `user_metadata` de JWT.
- Convites têm token imprevisível, guardar apenas hash, validade limitada, uso único, revogação, rate limiting e resposta que não revele se um e-mail já tem conta.
- Limitar inscrição, verificação, recuperação e refresh através dos controlos de Supabase Auth e rever os valores de cada projeto antes do deploy. Triggers Postgres aplicam 120 transações de escrita por utilizador em janela móvel de 60 segundos, partilhadas entre instâncias; o estado mínimo fica privado e expira após 24 horas. A API converte o limite para HTTP 429. Os limites de convites são adicionais.
- Views são avaliadas quanto a `security_invoker`/RLS e grants; funções com `SECURITY DEFINER` são exceção, não padrão, e exigem `search_path` fixo, autorização explícita e revisão de segurança.

## Região, plano de piloto e recuperação

- O projeto Supabase fica em Paris (`eu-west-3`). O plano Free é aceite para desenvolvimento/staging e piloto inicial de baixa afluência, tendo em conta que pode pausar após inatividade e não inclui backups geridos. Isto não é uma garantia de SLA nem uma aprovação para escalar ou operar produção com dados reais sem reavaliação.
- Meta operacional aprovada: RPO ≤24 horas, RTO ≤8 horas, retenção de 7 dias. Cópias destinadas ao Cloudflare R2 devem usar jurisdição EU, cifragem antes do upload e quota gratuita apenas; impedir overage, interrompendo novas cópias e alertando antes de exceder o limite.
- A cópia tem dados pessoais e deve ser considerada tratamento de dados: acesso mínimo, chaves fora do bucket, monitorização, expiração verificável e documentação de que a eliminação em cópias ocorre no máximo após a retenção aprovada.
- Para recuperação foi escolhido o guia Supabase plataforma-para-self-hosted. Os dumps incluem explicitamente `auth,public,private`, e o workflow bloqueia o upload se os marcadores de `auth.users` e `auth.identities` não estiverem presentes. Settings de Auth são configuradas separadamente, e o destino self-hosted continua por provisionar e testar. Nunca guardar secrets no dump ou repositório; o RPO/RTO continua por validar.
- Um agendamento GitHub Actions é best effort; monitorizar a data/hora da última cópia e alertar se exceder 24 horas. Executar restauro trimestral e registar duração, integridade e lacunas.
- Rever DPA, subprocessadores e localização para Supabase e Cloudflare antes de aceitar dados reais em produção. Região EU não equivale a conformidade RGPD.
- Testar cada política com utilizador A, utilizador B, membro removido, owner, contributor, viewer e visitante não autenticado. Testes cobrem leitura, escrita, alteração de proprietário/IDs e acesso a identificadores adivinhados (BOLA/IDOR).

## Exportação de dados pessoais

O endpoint autenticado `GET /api/v1/me/export` fornece um anexo JSON dos dados do perfil próprio e dos orçamentos que a pessoa consegue ler naquele momento. A API encaminha o JWT original à Data API; RLS continua a filtrar perfil e orçamento e a autorização do domínio valida cada orçamento. O pacote contém configuração, períodos, categorias, labels de despesa, alocações, rendimentos com snapshots, despesas com label, ajustes e agendamentos recorrentes. Em dados partilhados, os IDs de membro que identificam a autoria de movimentos e agendamentos são omitidos. A resposta define `Cache-Control: no-store`; tokens e segredos não integram o ficheiro. A exportação não substitui um processo operacional para verificar, registar e responder aos pedidos de titulares.

## Autenticação e sessão

- Supabase Auth gere credenciais e recuperação; a aplicação nunca armazena palavras-passe.
- Spring Security Resource Server valida assinatura usando JWKS oficial, `iss`, `exp` e restantes claims requeridas; rejeita token inválido/expirado. Não implementar criptografia JWT manualmente.
- Chaves públicas de frontend são identificadores, não segredos; chaves `service_role`/`sb_secret` e passwords de banco são credenciais elevadas de servidor que contornam RLS. Nunca usar prefixo público para segredo, registar esses valores em logs ou enviar `sb_secret` como Bearer JWT.
- MFA, recuperação de conta e sessão têm política explícita; exigir MFA em contas de operador/admin e avaliar MFA obrigatório para utilizadores consoante risco. MFA não substitui autorização.
- A app usa PKCE. iOS/Android guardam a sessão em blocos no Expo SecureStore para respeitar o limite de tamanho por valor, acessível com o dispositivo desbloqueado; a web usa `sessionStorage` para terminar a persistência quando o separador fecha. A sessão web continua acessível a JavaScript e não resiste a XSS; proteger a aplicação e os seus fornecedores de scripts é obrigatório. Nunca guardar palavras-passe.
- O callback recebe apenas o código PKCE de utilização única, troca-o imediatamente por uma sessão e limpa-o da rota através de navegação substitutiva. Access/refresh tokens não são colocados em URLs, telemetria, crash reports ou logs. Restringir URLs de redirect a cada ambiente.
- Publicar CSP como cabeçalho HTTP na hospedagem web, com `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` e listas explícitas de `connect-src` para a API e o projeto Supabase do ambiente. Restringir também scripts, estilos, imagens e fontes ao que o build Expo realmente exige; validar o build final e remover exceções de desenvolvimento antes de produção. Não usar um domínio Supabase/API wildcard nem considerar CSP meta tag um substituto para cabeçalhos de resposta.
- A CSP concreta ainda depende do fornecedor de hosting escolhido; rever cabeçalhos e redirects de produção antes do lançamento.

## Dados, auditoria e resposta

1. Classificar dados e limitar payloads recolhidos/observados.
2. A auditoria regista quem fez que ação, quando e sobre que identificador interno; limitar dados pessoais e acesso ao registo.
3. Não enviar nomes, saldos, categorias ou conteúdo de poupanças a ferramentas de IA, analytics ou logs sem finalidade, base legal, contrato e avaliação documentados.
4. Ao receber alerta, preservar logs relevantes, conter acesso, determinar categorias e pessoas afetadas, avaliar risco para direitos/liberdades e documentar decisão de notificação. Subcontratantes devem avisar o operador sem demora contratualmente definida.
5. Não apagar evidência do incidente ao executar remediação; registar decisão, responsável, horários e ações.

## Checklist de lançamento

- [ ] Responsável, contacto de privacidade e apoio definidos.
- [ ] Mapa de dados, finalidade/base legal, avisos, consentimentos e retenção aprovados.
- [ ] AIPD/DPIA e necessidade de DPO avaliadas e documentadas.
- [ ] DPA/subprocessadores/região/backups/transferências aprovados para cada fornecedor.
- [ ] RLS e grants testados para todas as tabelas, views, funções e storage expostos.
- [ ] JWT, MFA/admin, sessão, rate limits, CORS, CSP, TLS e segredo revistos.
- [ ] Exportação, correção, apagamento, revogação de convite e encerramento de conta testados.
- [ ] Backups restaurados num exercício; retenção e RPO/RTO aprovados.
- [ ] Plano de resposta a incidentes com janela de 72 horas, contactos e simulação.
- [ ] Code reviewer e tester aprovam release; revisão humana aprova riscos e migrações.

## Referências oficiais

- [Regulamento (UE) 2016/679 — RGPD, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679)
- [EDPB — Orientações 4/2019, proteção de dados desde a conceção e por defeito](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-42019-article-25-data-protection-design-and_en)
- [EDPB — Orientações 9/2022, notificação de violações](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en)
- [Comissão Europeia — obrigações de proteção de dados](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en)
- [CNPD Portugal](https://www.cnpd.pt/)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — JWT](https://supabase.com/docs/guides/auth/jwts)
- [Supabase — ligação a PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)

### Identidade em orçamentos partilhados

Membros ativos podem ver apenas o nome de perfil de outros membros ativos no mesmo orçamento, para identificar as pessoas que colaboram no fundo comum. Se o perfil ainda não existir, usa-se apenas o nome do metadata Auth fornecido no registo. Email, telefone, `user_id` e outros campos de perfil não são expostos. A RPC `list_budget_members` exige que o JWT atual tenha membership ativa no orçamento e limita os resultados a esse orçamento; perfis continuam sem acesso direto por RLS. Se a membership for removida, pedidos seguintes deixam de devolver nomes ou permitir acesso.

