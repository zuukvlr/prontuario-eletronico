# Criar e configurar o projeto Firebase

Este guia usa o Console do Firebase (https://console.firebase.google.com) e o terminal. Você precisará de uma conta Google. **Nada disso foi feito por mim**: depende das suas credenciais.

## 1. Criar o projeto

1. *Adicionar projeto* → nome (ex.: `prontuario-clinica`). Desative o Google Analytics (não é necessário).
2. **Plano Blaze** (pago por uso) é necessário para Cloud Functions (IA) e recomendado para backups. Sem IA, o plano gratuito (Spark) funciona. Configure alertas de orçamento.

## 2. Ativar os serviços

- **Authentication** → *Começar* → método **E-mail/senha** (ative). **Não** ative "Link por e-mail" nem provedores desnecessários. Em *Configurações → Domínios autorizados*, mantenha só seus domínios.
- **Firestore Database** → *Criar banco* → modo **produção** → região **`southamerica-east1` (São Paulo)** (não muda depois).
- **Storage** (opcional; exige plano Blaze em projetos novos — sem ele, defina `VITE_STORAGE_ENABLED=false` e publique as regras com `npm run deploy:rules:firestore`) → *Começar* → modo produção, mesma região.
- **Hosting** → *Começar* (se for usar Firebase Hosting).

## 3. Registrar o app Web e preencher o `.env.local`

*Configurações do projeto → Seus apps → Web (`</>`)* → copie o objeto `firebaseConfig` e preencha `.env.local` (copiado de `.env.example`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Esses valores identificam o projeto e não são segredos, mas a proteção real está nas **regras de segurança**. Restrinja a *API key* por referenciador HTTP no Google Cloud Console (APIs e serviços → Credenciais).

## 4. Publicar regras e índices

```bash
npx firebase login
cp .firebaserc.example .firebaserc     # edite com o ID do seu projeto
npm run deploy:rules
```

Os índices podem levar alguns minutos para ficar prontos (consultas falham com "índice em criação" até lá).

## 5. Criar o primeiro administrador

Como não existe cadastro público, o primeiro admin é criado por script, com uma **conta de serviço** que fica **fora do repositório**:

1. Console → *Configurações do projeto → Contas de serviço → Gerar nova chave privada*. Salve **fora da pasta do projeto**.
2. No PowerShell:
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\seguro\service-account.json"
   $env:FIREBASE_PROJECT_ID = "seu-projeto"
   $env:ADMIN_EMAIL = "voce@clinica.com.br"; $env:ADMIN_NAME = "Seu Nome"
   npm run admin:create
   ```
3. Na tela de login use **Esqueci minha senha** para definir a senha. Depois **apague/rotacione** a chave da conta de serviço.
4. Já logado, use *Usuários e permissões* para autorizar os demais usuários e *Configurações* para o nome da clínica.

## 6. Desenvolver sem risco: emuladores

```bash
npm run emulators      # Auth, Firestore e Storage locais (exige JDK 21+)
npm run seed:demo      # dados fictícios (João da Silva)
# em .env.local: VITE_USE_EMULATORS=true
```

## 7. Boas práticas imediatas

- Ative **Verificação em duas etapas** nas contas Google com acesso ao projeto.
- Ative **backups** do Firestore (ver [BACKUP.md](BACKUP.md)).
- Em *Authentication → Configurações → Política de senha*, exija comprimento mínimo ≥ 10.
- Revise o [checklist de segurança](SEGURANCA.md).
