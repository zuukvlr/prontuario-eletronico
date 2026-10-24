# Arquitetura e modelo de dados

## Camadas

```
pages/ (telas) → components/ → hooks/ + context/ → services/ (único acesso ao Firebase) → Firebase
                                  └ lib/ (regras puras: datas, validação, consolidação de relatórios, PDF, hash)
```

Componentes **não** importam o SDK do Firebase; usam funções de `services/`. A lógica de relatório (`lib/reports/builder.ts`) é pura e testada.

## Coleções do Firestore

| Coleção | Conteúdo | Quem lê | Quem escreve |
|---|---|---|---|
| `users/{uid}` | nome, e-mail, perfil (`admin`\|`professional`), `active`, registro profissional | o próprio / admin | admin |
| `patients/{id}` | cadastro, `code` PAC-…, `status`, `responsibleUid`, **`accessUids`** | admin ou quem está em `accessUids` | admin (sem exclusão) |
| `clinicalRecords/{id}` | `patientId`, `type`, `attendedAt` (atendimento), `createdAt` (servidor), autor, `content`, `attachments`, `version`, `status`, `amendmentCount`, `accessUids`, `searchTokens` | admin ou `accessUids` | autor (rascunho); finalizado = imutável |
| `clinicalRecords/{id}/amendments/{id}` | adendo/retificação: motivo, texto, campo, valor anterior, autor, horário | idem registro | criação apenas (append-only) |
| `generatedReports/{id}` | seções, avisos, origem (local/IA), `groupId`, `version`, `number`, `status`, `contentHash` | admin ou `accessUids` | autor (rascunho); final = imutável |
| `auditLogs/{id}` | ação, entidade, ator, resumo sem conteúdo clínico | admin (todos) / usuário (os próprios) | criação apenas (append-only) |
| `settings/app`, `settings/counters` | configurações, sequência de códigos | usuários ativos | admin |

Storage: `patients/{patientId}/{recordId}/{arquivo}` — leitura/criação só para quem acessa o paciente; sem sobrescrita/exclusão; ≤ 10 MB; tipos permitidos.

### Por que `accessUids` nos registros?

As regras do Firestore **não filtram** resultados: uma consulta só é permitida se puder ser provada autorizada. Copiar `accessUids` do paciente para cada registro/relatório permite `where('accessUids','array-contains', uid)` (pesquisas entre pacientes) sem expor nada. Quando as permissões do paciente mudam, `patientService.updatePatient` sincroniza os registros e relatórios (e as regras só permitem ao admin alterar esse campo).

## Datas

- `attendedAt`: quando o atendimento ocorreu (informado; não pode ser futuro).
- `createdAt`: `serverTimestamp()`, validado pelas regras (`== request.time`); nunca editável.
- Exibição em `America/Sao_Paulo`, formato DD/MM/AAAA (`lib/date.ts`).

## Relatórios: fluxo

1. `reportGenerator.generateReport` carrega registros (a leitura já é limitada pelas regras) → `buildReport` (local) **ou** Cloud Function de IA.
2. Salva **rascunho** (`generatedReports`, status `rascunho`).
3. Profissional revisa/edita → **Aprovar e finalizar** grava `status: final`, `finalizedAt`, `contentHash`.
4. Alterações posteriores → **nova versão** (novo documento, `version+1`, `parentId`); a anterior permanece intacta.
5. PDF (`lib/reports/pdf.ts`) e impressão (`@media print`) reproduzem o documento; cada exportação é auditada.

## Desempenho

Paginação por cursor (`startAfter`) nas listas e na linha do tempo; índices compostos em `firestore.indexes.json`; telas carregadas sob demanda; jsPDF e Firebase em chunks separados; cache do Firestore em memória (sem dados clínicos em disco).
