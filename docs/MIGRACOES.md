# Migrações de dados (seguras e reversíveis)

Publicar código **não** altera dados. Quando uma mudança de estrutura for necessária, siga este processo. **Nunca** execute migrações destrutivas automaticamente (CI/CD não roda migrações).

## Princípios

1. **Compatibilidade para frente e para trás (expandir → migrar → contrair).**
   - *Expandir:* adicione campos novos como **opcionais**; o código aceita ausência (ver `mappers.ts`, que aplica padrões).
   - *Migrar:* script idempotente preenche os novos campos.
   - *Contrair:* só depois de validado e com backup, pare de usar/remova o campo antigo (em outra versão).
2. **Backup antes** (PITR/exportação – BACKUP.md) e janela combinada.
3. **Ensaiar** em cópia restaurada ou emulador com dados fictícios.
4. **Idempotente e em lotes** (≤ 400 operações por `WriteBatch`), com `--dry-run` por padrão.
5. **Reversível:** o script guarda o valor anterior em `migrations/{id}/items/{docId}` (ou arquivo local) para permitir `--rollback`.
6. **Registrado:** documento `migrations/{id}` com autor, data, versão e resultado; ação na auditoria.
7. **Não editar registros finalizados:** o conteúdo clínico finalizado é imutável. Migrações só podem tocar metadados técnicos (ex.: `searchTokens`, `accessUids`) ou criar campos derivados; mudanças de conteúdo clínico exigem adendo.

## Modelo de script (`scripts/migrations/AAAA-MM-DD-nome.mjs`)

```js
// uso: node scripts/migrations/2026-11-01-exemplo.mjs [--apply] [--rollback]
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const apply = process.argv.includes('--apply')
const snap = await db.collection('clinicalRecords').where('novoCampo', '==', null).get()
console.log(`${snap.size} documentos a migrar (${apply ? 'APLICANDO' : 'simulação'})`)
for (let i = 0; i < snap.docs.length; i += 400) {
  const batch = db.batch()
  for (const d of snap.docs.slice(i, i + 400)) {
    batch.set(db.doc(`migrations/2026-11-01-exemplo/items/${d.id}`), { before: d.get('novoCampo') ?? null })
    batch.update(d.ref, { novoCampo: 'valor-padrao' })
  }
  if (apply) await batch.commit()
}
```

Execute com `GOOGLE_APPLICATION_CREDENTIALS` apontando para uma conta de serviço **fora do repositório**.

## Alterações em regras e índices

- Edite `firestore.rules` / `firestore.indexes.json`, rode `npm run test:rules` e revise o diff em PR.
- Publique com `npm run deploy:rules` fora de horário de pico. Índices novos demoram a ficar prontos: publique-os **antes** do código que os usa.
- Remover índices só depois de a versão que os usava sair de produção.
