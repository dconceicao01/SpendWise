## 📄 Documentação – “SpendWise” (objetivo, módulos, requisitos, roadmap)

# SpendWise – Documentação do Projeto

## 1. Objetivo geral
Aplicação cross‑platform de gestão de poupanças que permite ao utilizador criar, editar e eliminar “poupanças” com ou sem meta, definir categorias e percentagens de alocação, partilhar a gestão com outras pessoas e visualizar progresso em dashboard.

## 2. Módulos principais (MVP)

| Módulo | Casos de uso principais |
|--------|------------------------|
| **Autenticação & Perfil** | Login/Logout, recuperação de palavra-passo, definição de nome/photo, definição de “on‑board” inicial. |
| **Poupanças** | Criar/editar/apagar poupança. Definir nome, meta opcional, frequência de recorrência (mensal, semanal, nenhum). Marcar como partilhada ou privada. |
| **Categorias & Alocação (% )** | Dentro de cada poupança, criar categorias (ex: “Moradia”, “Lazer”, “Imprevistos”). Definir percentagem fixa por depósito recorrente. Editar percentagem (a soma deve dar 100%). Visualizar distribuição por gráfico de pizza. |
| **Partilha entre Utilizadores** | Owner convida outros utilizadores por e‑mail/link. Papéis: `OWNER`, `CONTRIBUTOR`, `VIEWER`. Cada contribuidor pode definir a sua percentagem de entrada fixa (ex: casal 500€ cada). Recorrência partilhada gera movimentos automáticos por utilizador. |
| **Depósitos & Histórico** | Adicionar depósito manual ou automático. Histórico temporal por poupança. Relatório mensal: total metido, percentagens por categoria, progresso da meta. |
| **Dashboard** | resumo rápido: total poupado este mês, total gasto, saldo atual em todas as poupanças. Barras por meta com % atingido. Gráfico de pizza da distribuição deste mês. “Streak/consistência”: quantos meses seguidos tem entrado dinheiro. Últimos 5 depósitos. |

## 3. Requisitos funcionais

- **FR1:** Utilizador pode criar uma poupança com nome, meta opcional e frequência.
- **FR2:** Cada poupança tem um conjunto de categorias, cada uma com percentagem fixa (soma 100%).
- **FR3:** Quando há entrada recorrente, o sistema gera o movimento pelo valor total e particiona pelas categorias segundo as percentagens definidas.
- **FR4:** Partilha: owner convida utilizadores; cada um define a sua percentagem de contribuição fixa (se for o caso).
- **FR5:** Dashboard agrega estatísticas de todas as poupanças do utilizador/grupo.
- **FR6:** Notificações opcionais “é dia de depositar” ou “meta atingida”.

## 4. Requisitos não‑funcionais

- **Performance:** tempo de resposta < 200 ms para operações de leitura (listagem de poupanças, progresso).
- **Segurança:** autenticação baseada em Auth.js (NextAuth) / OAuth ou e‑mail + password. Dados sensíveis encriptados ao repouso (PostgreSQL).
- **Cross‑platform:** uma única codebase (ex: NestJS API + Flutter front‑end) que compiles para web e mobile.
- **Deploy:** Vercel (web) + Expo (mobile) com pipelines CI/CD e rollback seguro.

## 5. Roadmap evolutivo (futuras versões)

1. **Integração bancária** – importação automática de transacções via Yodlee/Plaid ou APIs abertas dos bancos portugueses.
2. **Gamificação** – badges por consistência, streaks, desafios de poupança, rankings familiares.
3. **Modo “Splitwise”** – separação de compras em grupos de amigos, divisão de despesas partilhadas.
4. **Modo empresa** – controlo de despesas internas, orçamentos departamentais, relatórios corporativos.
5. **Relatórios avançados** – projections de cash‑flow, análise de hábitos de gasto, sugestões de cortes.

## 6. Stack tecnológica sugerida

Ainda por definir