# Piloto pessoal na Vercel

## Âmbito

Esta opção foi aceite para avaliar um piloto pessoal com, no máximo, cinco pessoas. Usa Vercel Hobby apenas para uso pessoal e não comercial, sem garantia de disponibilidade. A API depende do runtime de containers da Vercel, atualmente em beta e faturado segundo as regras/quotas de Functions; pode escalar a zero. Confirmar termos e quotas atuais na conta antes de publicar. A decisão não se estende a produção.

São necessários dois projetos Vercel independentes para evitar dependência da funcionalidade Services, que não é necessária neste desenho:

| Projeto | Root Directory | Build/deploy |
| --- | --- | --- |
| Web | `frontend/` | `frontend/vercel.json` define `pnpm build:web` e output `dist/`; usar Node.js 24 e pnpm 12.20 |
| API | `backend/` | `backend/vercel.json` seleciona Container runtime e Paris (`cdg1`); `Dockerfile.vercel` constrói a API |

Em cada projeto, definir o respetivo diretório raiz no monorepo (`frontend/` ou `backend/`). Os ficheiros `vercel.json` guardam build, output, runtime e região no controlo de versões. No projeto da API, definir `PORT=8080` como variável de ambiente de runtime: o Spring Boot lê essa porta e usa `8080` como fallback local. O container não pode depender de disco local persistente nem de processos de fundo contínuos; tarefas agendadas continuam no Postgres/Supabase.

## Variáveis e configuração

O projeto web serve `GET /api/runtime-config`, uma função Vercel sem cache que devolve apenas os endpoints públicos ativos. Definir no projeto web estas variáveis de runtime, separadas das variáveis usadas como fallback no build:

- `SPENDWISE_ACTIVE_SUPABASE_URL`
- `SPENDWISE_ACTIVE_SUPABASE_PUBLISHABLE_KEY`
- `SPENDWISE_ACTIVE_API_URL`

O domínio canónico do web staging é `https://spendwise-web-staging.vercel.app`. A API deve incluir exatamente essa origem em `SPENDWISE_CORS_ALLOWED_ORIGINS`. Não adicionar `*`: aliases gerados por previews/branches não são necessários para usar o staging e devem continuar bloqueados pela allowlist.

Para builds Android/iOS, definir `EXPO_PUBLIC_RUNTIME_CONFIG_URL` com o URL HTTPS estável `https://<domínio-web>/api/runtime-config`. Esse endereço de bootstrap fica no binário; o destino Supabase/API pode mudar pela configuração Vercel sem publicar outra versão da app. A app carrega a configuração no arranque e ao voltar ao primeiro plano. Se uma atualização falhar, mantém o último destino carregado em memória e volta a tentar quando a app retoma. Num arranque sem acesso ao endpoint, usa os valores fallback do bundle.

A resposta é pública e não pode conter segredos. A chave publishable é pública por desenho; nunca incluir `service_role`, tokens ou credenciais. Alterar os destinos ativos muda a identidade do projeto Supabase e pode exigir novo início de sessão. A Vercel é uma dependência de controlo: indisponibilidade ou configuração incorreta impede descobrir o destino ativo. Proteger a conta Vercel com MFA e acesso operacional restrito.

No ambiente server-side do projeto API, configurar `PORT=8080` e valores próprios do projeto de teste:

- `SUPABASE_ISSUER_URI`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — chave `sb_secret_...`, estritamente server-side; usada apenas pelo fluxo Auth Admin de eliminação já previsto. Contorna RLS e nunca deve ser exposta ao frontend, logs ou pedidos normais.
- `SPENDWISE_CORS_ALLOWED_ORIGINS` — origem HTTPS exata do projeto web, sem `*`
- `SPENDWISE_INVITATION_BASE_URL` — rota HTTPS de aceitação de convites no domínio web

No projeto web, definir como variáveis de build:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SPENDWISE_API_URL` — fallback inicial da app.
- `EXPO_PUBLIC_RUNTIME_CONFIG_URL` — URL estável de bootstrap para builds Android/iOS.

Só a chave publishable pode estar no bundle web. Nunca usar uma chave `service_role`/`sb_secret` em `EXPO_PUBLIC_*`, código, logs ou variáveis disponíveis ao projeto web. Não replicar segredos entre projetos/ambientes. Restringir os redirect URLs do Supabase Auth ao domínio do piloto e callbacks necessários.

## Isolamento e publicação

Criar/usar um projeto Supabase isolado em Paris, sem copiar dados de outros ambientes. Usar contas sintéticas e validar Auth, CORS, convites, eliminação de conta e links de callback depois do deploy. As previews por pull request devem usar configuração Supabase de teste isolada ou não habilitar operações autenticadas; nunca apontar para dados reais.

Os containers são efémeros, podem reiniciar e escalam a zero. O piloto não deve depender de estado local ou disponibilidade contínua. Monitorizar quotas e suspender o piloto antes de ultrapassar limites; não ativar faturação sem decisão separada. Antes de qualquer promoção a produção, escolher novamente o hosting e aprovar contratos/DPA, região, segurança, backups/restauro, limites, observabilidade e rollback.

## Referências do fornecedor

- [Running Docker on Vercel](https://vercel.com/kb/guide/docker): containers OCI como Functions, `Dockerfile.vercel`, porta HTTP, scale-in e faturação.
- [Regiões de Functions](https://vercel.com/docs/functions/configuring-functions/region): Hobby permite escolher uma região, incluindo Paris (`cdg1`).
- [Termos Vercel](https://vercel.com/legal/terms): confirmar as condições de uso pessoal/não comercial e as condições vigentes do plano.

