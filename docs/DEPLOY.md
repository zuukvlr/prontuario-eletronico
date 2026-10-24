# GitHub e deploy automático

**O GitHub guarda o código e as versões; o Firebase guarda os dados.** Publicar uma nova versão do código nunca apaga nem recria o banco.

## 1. Repositório privado no GitHub

> O repositório pode ser público (o código não contém dados nem segredos) ou privado. Em ambos os casos, nunca versione credenciais, `.env*`, chaves de conta de serviço, exportações ou dados de pacientes (o `.gitignore` já bloqueia os padrões comuns).

```bash
git init -b main              # já feito neste projeto
git add .
git commit -m "Versão inicial"
# crie o repositório PRIVADO no GitHub (site ou: gh repo create prontuario --private --source . --push)
git remote add origin https://github.com/SEU-USUARIO/prontuario.git
git push -u origin main
```

Em *Settings → Branches*, proteja a `main` (exigir PR e o check **CI**). Em *Settings → Security*, ative Dependabot e secret scanning.

## 2. Opção A (recomendada): Firebase Hosting via GitHub Actions

Já configurado em `.github/workflows/`:

| Arquivo | Quando roda | O que faz |
|---|---|---|
| `ci.yml` | PRs e branches ≠ main | tipos, lint, testes, build, typecheck das Functions, testes das regras (emulador) |
| `deploy-preview.yml` | Pull Request | build + canal de **pré-visualização** (expira em 7 dias) |
| `deploy-production.yml` | push na `main` | tipos → lint → testes → build → **publica em produção** só se tudo passar |

Configuração (uma vez):

1. `firebase init hosting:github` **ou** crie manualmente uma conta de serviço com o papel *Firebase Hosting Admin* e *Cloud Run Viewer* (a ação oficial documenta isso).
2. No GitHub: *Settings → Secrets and variables → Actions → New repository secret*:
   - `FIREBASE_SERVICE_ACCOUNT` = JSON completo da conta de serviço
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
3. *Settings → Environments → production*: exija aprovação manual de um revisor se quiser um portão extra.
4. Adicione o domínio de pré-visualização (`SEU-PROJETO--*.web.app`) e seu domínio final em *Authentication → Domínios autorizados*.

> ⚠️ Pré-visualizações usam o **mesmo** projeto Firebase (mesmos dados). Para testar sem risco, crie um segundo projeto (staging) e use secrets separados para PRs.

Fluxo: você altera o código → `git push` (ou abre PR) → o CI verifica → na `main`, o build é publicado automaticamente.

## 3. Opção B: Vercel

1. Em vercel.com → *Add New Project* → importe o repositório privado.
2. Framework *Vite*; `vercel.json` já define build, rewrites de SPA e cabeçalhos.
3. Em *Settings → Environment Variables*, cadastre as variáveis `VITE_FIREBASE_*` (Production e Preview).
4. Cada push na `main` publica em produção; outras branches geram *Preview Deployments*. Adicione os domínios no Firebase Authentication.
5. Se usar Vercel, remova ou desative `deploy-production.yml` e `deploy-preview.yml` para não publicar duas vezes (mantenha `ci.yml`).

## 4. O que NÃO é publicado automaticamente (de propósito)

- **Regras do Firestore/Storage e índices:** `npm run deploy:rules` (manual, após revisar o diff e rodar `npm run test:rules`).
- **Cloud Functions:** `npx firebase deploy --only functions` (manual).
- **Migrações de dados:** ver [MIGRACOES.md](MIGRACOES.md). Nunca há migração destrutiva automática.

## 5. Reverter uma publicação

- Hosting: console → *Hosting → Histórico de versões → Reverter*.
- Código: `git revert <commit>` e push.
