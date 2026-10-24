# Checklist de segurança para produção

Marque cada item antes de usar com pacientes reais.

## Conta, acesso e Firebase
- [ ] Repositório GitHub (público ou privado) com 2FA para todos os colaboradores e branch `main` protegida. Se for público, lembre que as regras de segurança ficam visíveis: a proteção depende delas, não de segredo.
- [ ] Nenhum `.env*`, chave de conta de serviço, exportação ou dado real no Git (`git log -p | grep -i "private_key"` sem resultados).
- [ ] 2FA obrigatório nas contas Google/Firebase com acesso ao projeto; papéis do IAM com privilégio mínimo.
- [ ] Authentication: apenas provedor e-mail/senha; política de senha ≥ 10 caracteres; domínios autorizados revisados; cadastro público inexistente (somente `users/{uid}` criados por admin).
- [ ] Primeiro administrador criado e a chave da conta de serviço **revogada/apagada**.
- [ ] API key do app Web restrita por referenciador HTTP.
- [ ] Regras do Firestore e Storage **publicadas** (`npm run deploy:rules`) e `npm run test:rules` verde (JDK 21).
- [ ] Índices do Firestore com status *Pronto*.
- [ ] Firebase App Check avaliado/ativado (reduz abuso das APIs).
- [ ] Cota e alerta de orçamento configurados (Firestore, Storage, Functions, provedor de IA).

## Dados e privacidade
- [ ] Região `southamerica-east1`; Firestore com **Point-in-Time Recovery** e **backups agendados** (docs/BACKUP.md); restauração testada.
- [ ] Bucket do Storage sem acesso público; regras bloqueiam leitura/escrita por não autorizados.
- [ ] Política de retenção/descarte aprovada (docs/LGPD.md); responsável (encarregado/DPO) definido.
- [ ] Política de privacidade e termos para titulares; canal de atendimento de direitos (exportação em *Configurações*).
- [ ] Contratos (DPA) com Google/Firebase e, se usada, com o provedor de IA; transferência internacional avaliada.
- [ ] RIPD/DPIA registrado. Registro de incidentes e plano de resposta (notificação à ANPD/titulares).
- [ ] IA: desligada ou habilitada somente após avaliação (docs/IA.md); chave apenas no Secret Manager.

## Aplicação
- [ ] HTTPS obrigatório (Hosting/Vercel); cabeçalhos de segurança ativos (`firebase.json`/`vercel.json`).
- [ ] Timeout de inatividade ajustado (`VITE_IDLE_TIMEOUT_MINUTES`) conforme o ambiente.
- [ ] Usuários desligados da equipe **desativados** em *Usuários e permissões* no mesmo dia.
- [ ] Revisão trimestral de: administradores, vínculos paciente↔profissional, auditoria de acessos incomuns.
- [ ] `npm audit` e Dependabot revisados; atualizações aplicadas via PR com CI verde.
- [ ] Computadores da equipe com disco criptografado, bloqueio de tela e navegador atualizado.
- [ ] Console do navegador/logs sem dados clínicos (o sistema não registra conteúdo em logs).

## Validade do prontuário
- [ ] Requisitos do conselho profissional (CFM/COFEN/CFP etc.), integridade, autenticidade, assinatura qualificada e guarda mínima verificados com assessoria jurídica. O sistema grava hash SHA-256 nos relatórios finalizados, mas **não** substitui assinatura ICP-Brasil.
