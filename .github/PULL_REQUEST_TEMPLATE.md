## Objetivo

<!-- O que muda e qual tarefa/requisito satisfaz? -->

## Risco e impacto

- Risco: baixo / médio / alto
- Áreas afetadas: frontend / API / dados / autenticação / CI/CD / documentação
- Impacto em privacidade ou dados pessoais (finalidade, minimização, retenção, exportação/apagamento):
- Segredos, permissões, RLS ou autorização alterados? Descrever:

## Base de dados e migrações

- [ ] Não há alterações de esquema
- [ ] Migração incluída e testada desde uma base vazia
- [ ] Compatibilidade durante deploy e plano de recuperação descritos
- Detalhes:

## Validação

- Testes/comandos executados e resultado:
- Testes manuais ou em staging (ambiente e dados sintéticos):
- Limitações conhecidas (incluindo testes nativos, se aplicável):

## Revisão independente

- [ ] Code reviewer independente reviu o diff e registou findings/resolução
- [ ] QA/tester independente verificou os critérios de aceitação e registou o resultado
- [ ] Segurança/privacidade aprovou se houve alterações a auth, RLS, permissões, dados pessoais ou segredos

## Publicação e recuperação

- Impacto no deploy:
- Plano de rollback/roll-forward:
- Documentação/runbook atualizado:

## Checklist do autor

- [ ] Critérios de aceitação estão cobertos por evidência
- [ ] Não incluí dados reais, tokens, passwords ou segredos em código, fixtures, screenshots ou logs
- [ ] Erros e logs não expõem dados pessoais ou conteúdo do orçamento
- [ ] Dependências e lockfiles foram atualizados de forma reproduzível
- [ ] PR está pronto para revisão humana
