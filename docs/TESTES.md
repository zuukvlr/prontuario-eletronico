# Roteiro de testes

Use **somente dados fictícios** (ambiente de emulador ou projeto de teste). Marque ✅/❌.

## A. Automatizados

| Comando | Cobre |
|---|---|
| `npm run typecheck` | tipos TypeScript |
| `npm run lint` | ESLint |
| `npm test` | consolidação (ordem cronológica, vários registros/dia, período, tipo, ausências/contradições, rascunhos, alergia×medicamento, adendos, prescrito×administrado, hipótese×diagnóstico), datas pt-BR/fuso, hash |
| `npm run test:rules` | regras no emulador (JDK 21): acesso negado a anônimos/inativos/sem perfil, isolamento entre profissionais, imutabilidade, auditoria append-only |
| `npm run build` | build de produção |

## B. Manuais (emulador + `npm run seed:demo`)

### Autenticação
1. Login com `profissional@demo.local` / `Demo@12345` → entra no dashboard. ☐
2. Senha errada → mensagem "E-mail ou senha incorretos". ☐
3. "Esqueci minha senha" → mensagem neutra (igual para e-mail inexistente); no emulador, e-mail aparece na UI do Auth (porta 4000). ☐
4. Acessar `/pacientes` deslogado → redireciona ao login e volta após entrar. ☐
5. Ficar inativo > tempo configurado (use `VITE_IDLE_TIMEOUT_MINUTES=5`) → sessão encerrada com aviso. ☐
6. Logout → volta ao login; botão Voltar do navegador não mostra dados. ☐

### Permissões
7. Profissional: **não** vê "Novo paciente" nem "Usuários"; `/usuarios` e `/pacientes/novo` redirecionam ao início. ☐
8. Admin cria um 2º profissional (Usuários) → ele só vê pacientes aos quais for vinculado. ☐
9. No Console do emulador, tentar ler `patients` com o 2º profissional (via `npm run test:rules` ou SDK) → negado. ☐
10. Desativar um usuário → no próximo acesso ele é barrado. ☐

### Pacientes
11. Admin cadastra paciente (campos obrigatórios; menor de idade exige responsável; datas futuras rejeitadas). ☐
12. Cadastrar nome + nascimento repetidos → aviso de duplicidade. ☐
13. Editar; alterar vínculo de profissionais → registros antigos passam a respeitar o novo acesso. ☐
14. Arquivar com motivo → novos registros bloqueados; histórico permanece; reativar funciona. ☐
15. Busca por parte do nome e por `PAC-000001`; filtros de status/responsável; "Carregar mais". ☐

### Histórico clínico
16. Criar 4 evoluções (01–04/10/2026) como no exemplo do João da Silva (o seed já traz). ☐
17. Criar **dois registros no mesmo dia** → ambos aparecem agrupados na data. ☐
18. Criar registro retroativo (data de atendimento anterior) → timeline ordena pela data do atendimento e mostra "Inserido em…". ☐
19. Trocar o tipo (Prescrição, Exame, Observação…) → campos do formulário se adaptam. ☐
20. Rascunho: salvar, reabrir, editar, finalizar. Registro finalizado **não** tem botão de editar. ☐
21. Adendo e retificação: motivo obrigatório; valor original continua visível. ☐
22. Anexar PDF/imagem (>10 MB e tipo inválido são recusados); abrir o anexo. ☐
23. Filtros de período/tipo e ordem asc/desc. ☐

### Pesquisa
24. Em Histórico clínico: pesquisar por medicamento, sintoma, termo livre, tipo e período; abrir resultado → registro original. ☐

### Relatórios
25. Gerar cada um dos 8 tipos; verificar escopo, ordem, referências `REG-…`. ☐
26. Período vazio (sem registros) → aviso "não há dados suficientes". ☐
27. Criar dados contraditórios (dose diferente do mesmo medicamento; dois diagnósticos confirmados; exame sem resultado) → aparecem na seção de pontos de atenção. ☐
28. Confirmar que hipótese **não** aparece como diagnóstico e prescrição **não** aparece como administrada. ☐
29. Editar texto do rascunho, salvar, **Aprovar e finalizar** (exige confirmação). Depois disso não há edição. ☐
30. "Nova versão" e "Reconsolidar" criam v2; v1 continua acessível e inalterada; lista de versões à direita. ☐
31. Baixar PDF: cabeçalho, paginação "Página X de Y", marca d'água RASCUNHO em rascunhos, hash em finais, referências de origem, assinatura. Imprimir: só o documento. ☐
32. (Com IA configurada) Gerar com IA → rascunho marcado como IA; conferir que o nome do paciente não foi enviado (logs da função). ☐

### Auditoria e dados
33. Auditoria (admin) lista login, visualizações, criações, adendos, exportações; profissional vê só as próprias. ☐
34. Exportar JSON do paciente (Configurações). ☐

### Interface
35. Desktop, tablet (768 px), celular (375 px): menu lateral vira gaveta; tabelas rolam; formulários usáveis. ☐
36. Navegação por teclado (Tab/Enter/Esc em modais), foco visível, tema escuro, leitor de tela nos formulários. ☐
37. Desligar a rede → faixa "Sem conexão"; erros mostram mensagens amigáveis; telas vazias orientam o usuário. ☐
