# LGPD, retenção e validade jurídica

> Este documento descreve **medidas técnicas e operacionais** que o sistema oferece e o que a organização ainda precisa fazer. Não é parecer jurídico. Usar Firebase **não torna** a operação conforme à LGPD: conformidade depende de base legal, governança, contratos e processos.

## O que o sistema implementa

| Princípio / requisito | Medida |
|---|---|
| Segurança (art. 46) | Autenticação, perfis, regras do Firestore/Storage (negar por padrão), sessão por aba + timeout por inatividade, cabeçalhos HTTP, anexos sem acesso público |
| Controle de acesso | Profissionais só acessam pacientes vinculados (`accessUids`); admins acessam todos; usuário desativado perde acesso |
| Rastreabilidade (art. 37) | `auditLogs` append-only (login, acessos a prontuário/registro, criações, adendos, relatórios, exportações, alterações de usuário) — **sem conteúdo clínico** |
| Integridade do prontuário | Registros finalizados imutáveis (regras); correção por adendo/retificação com motivo, autor, horário; data do atendimento ≠ data de inserção (servidor); relatórios finais imutáveis, versionados, com hash SHA-256 |
| Proteção contra exclusão | Pacientes só são arquivados; nenhum registro/relatório final pode ser excluído pelo cliente |
| Direitos do titular (art. 18) | *Configurações → Exportação de dados do titular* (JSON). Correção via adendo/retificação ou edição cadastral |
| Minimização | Campos opcionais; IA recebe dados sem identificadores diretos; `localStorage` não guarda dados clínicos (apenas IDs recentes na sessão) |

## O que a organização precisa providenciar

1. **Base legal** (tutela da saúde, obrigação legal/regulatória, consentimento quando necessário), **controlador/operador** e **encarregado (DPO)**.
2. **Política de privacidade**, aviso aos pacientes e canal de atendimento aos titulares.
3. **Contratos/DPA** com Google (Firebase/Cloud) e com o provedor de IA, se usado; avaliar **transferência internacional** (arts. 33–36) — o armazenamento está em São Paulo, mas serviços auxiliares/IA podem processar fora do Brasil.
4. **RIPD/DPIA** e plano de resposta a incidentes (comunicação à ANPD e aos titulares).
5. **Treinamento** da equipe (não digitar dados desnecessários, sigilo profissional, uso de dispositivos).

## Retenção e descarte

- Padrão de referência no sistema: **20 anos** de guarda do prontuário (configurável em *Configurações*), em linha com a Lei 13.787/2018 para prontuários em meio eletrônico digitalizados/eletrônicos e normas do CFM (Res. 1.821/2007 e posteriores). **Confirme o prazo aplicável à sua profissão e ao seu tipo de serviço.**
- **Nada é apagado automaticamente.** O descarte é um procedimento controlado:
  1. Relatório periódico (admin) de pacientes sem atividade além do prazo.
  2. Aprovação do responsável/DPO e registro em ata.
  3. Exportação e arquivamento seguro (se exigido), depois exclusão feita por **script administrativo** (conta de serviço, fora do app), registrando a ação.
  4. Os backups seguem o ciclo de retenção próprio (BACKUP.md); a eliminação completa ocorre quando os backups expiram.
- Arquivar um paciente ≠ eliminar dados.

## Direitos dos titulares – roteiro

| Pedido | Como atender |
|---|---|
| Confirmação/acesso | Exportar JSON do paciente (Configurações) e entregar por canal seguro, validando identidade |
| Correção | Edição cadastral (admin); dados clínicos via retificação/adendo (histórico preservado) |
| Anonimização/eliminação | Avaliar caso a caso: dados de prontuário têm guarda obrigatória (art. 16, I); registrar a justificativa da negativa ou executar o descarte controlado |
| Portabilidade | JSON exportado |
| Informação sobre compartilhamento | Informar operadores (Google, provedor de IA se habilitado) |

## Assinatura, integridade, autenticidade e validade

- O sistema garante **integridade e rastreabilidade** técnicas (carimbo de servidor, imutabilidade, versões, hash SHA-256 de relatórios finalizados, auditoria).
- **Não** implementa assinatura eletrônica qualificada (ICP-Brasil), carimbo do tempo certificado nem certificação SBIS/CFM (NGS1/NGS2). Para que o prontuário eletrônico tenha plena validade e possa dispensar a guarda em papel, esses requisitos precisam ser avaliados conforme a regulamentação da sua área. Até lá, **não afirme** que o sistema atende a todas as exigências legais.
- Relatórios: PDFs trazem número, versão, situação, autoria, hash (quando finais) e espaço para assinatura do profissional; a assinatura ICP-Brasil pode ser aposta ao PDF por ferramenta externa.
