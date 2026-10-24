# Prontuário Eletrônico

Código aberto (repositório público): ele contém **somente o código**, nunca dados de pacientes nem credenciais. Os dados ficam no seu projeto Firebase, protegidos pelas regras de segurança.

Sistema web de gerenciamento de pacientes e prontuários eletrônicos: cadastro, histórico clínico cronológico (vários registros por dia), pesquisa, relatórios consolidados com revisão e PDF, auditoria e controle de acesso por perfil.

> **Importante:** este software manipula dados de saúde (dados pessoais sensíveis – LGPD). Usar o Firebase **não** garante, por si só, conformidade legal. Leia [docs/LGPD.md](docs/LGPD.md) e o [checklist de segurança](docs/SEGURANCA.md) antes de usar com pacientes reais. O sistema **não** implementa assinatura digital ICP-Brasil; a validade jurídica do prontuário eletrônico deve ser verificada com o conselho profissional da sua área.

## Tecnologias

React 18 + TypeScript · Vite · Tailwind CSS · componentes no estilo shadcn/ui (Radix) · Firebase (Authentication, Firestore, Storage, Hosting, Cloud Functions) · jsPDF · Vitest.

## Quem guarda o quê (leia isto)

| Parte | Onde fica | O que acontece numa atualização |
|---|---|---|
| **Código** (telas, regras de negócio) | **GitHub** (repositório público ou privado — o código não contém dados) | Cada `git push` gera um novo build publicado. |
| **Dados** (pacientes, registros, relatórios, usuários, anexos) | **Firebase** (Firestore/Storage/Auth) | **Nada é apagado ou recriado** ao publicar o código. |
| **Regras de segurança e índices** | Arquivos no repositório, publicados **manualmente** com `npm run deploy:rules` | Ficam sob seu controle; nunca mudam sozinhas. |

Atualizar o código **não** altera o banco. Mudanças na estrutura dos dados seguem o processo seguro de [docs/MIGRACOES.md](docs/MIGRACOES.md) (nunca automáticas nem destrutivas).

## Funcionalidades

- Login e-mail/senha, recuperação de senha, logout, sessão por aba com **encerramento por inatividade** (30 min, configurável), rotas protegidas, perfis **Administrador** e **Profissional**.
- **Sem cadastro público**: o administrador autoriza usuários (a pessoa recebe e-mail para definir a senha).
- Pacientes: cadastro completo, código `PAC-000001` automático, edição, arquivamento (nunca exclusão), filtros, busca por nome/código, detecção de duplicidade, permissões por paciente.
- Histórico clínico: linha do tempo por data **do atendimento** (distinta da data de **inserção**, carimbada pelo servidor), vários registros por dia, 9 tipos com campos que se adaptam, medicamentos (prescrito × administrado), anexos, rascunho → finalizado, **adendo/retificação** com motivo, autor e horário (conteúdo original preservado).
- Pesquisa avançada por paciente, período, tipo, profissional, medicamento, sintomas e termos.
- Relatórios (8 tipos): consolidação cronológica com referências `REG-XXXXXX`, detecção de informações ausentes/contraditórias, revisão e edição, **finalização com hash SHA-256**, versões imutáveis, PDF, impressão. IA **opcional** via Cloud Function.
- Auditoria imutável (sem conteúdo clínico), exportação de dados do titular (JSON), tema claro/escuro, responsivo.

## Início rápido (desenvolvimento)

Pré-requisitos: Node 20+ e (para emuladores/testes de regras) JDK 21+.

```bash
npm install
cp .env.example .env.local     # preencha com as credenciais do seu app Web Firebase
npm run dev
```

Sem `.env.local` o app exibe uma tela orientando a configuração. Passo a passo completo em [docs/FIREBASE.md](docs/FIREBASE.md).

Para testar localmente **sem tocar em dados reais** (emuladores + dados fictícios):

```bash
npm run emulators          # terminal 1
npm run seed:demo          # terminal 2 (cria João da Silva fictício e usuários demo)
# .env.local: VITE_USE_EMULATORS=true
npm run dev
```

> **Windows:** se o emulador falhar com `Unable to establish loopback connection` (ocorre dentro de sandboxes), rode no seu próprio terminal. `scripts/emulators.ps1` e `scripts/test-rules.ps1` usam um JDK 21 portátil em `%USERPROFILE%\jdk21-portatil` quando existir.

## Comandos

| Comando | Função |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run typecheck` | Verificação de tipos TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (gerador de relatórios, datas, hash…) |
| `npm run test:rules` | Testes das regras de segurança no emulador (JDK 21+) |
| `npm run build` | Build de produção |
| `npm run check` | Tipos + lint + testes + build |
| `npm run deploy:rules` | Publica regras do Firestore/Storage e índices |
| `npm run admin:create` | Cria o primeiro administrador (ver docs/FIREBASE.md) |

## Estrutura

```
src/
  components/ui/        primitivos de interface (botão, formulário, modal…)
  components/{layout,patients,records,reports}/
  context/              autenticação (com timeout de inatividade) e tema
  hooks/                useAsync, useSettings…
  lib/                  datas pt-BR/fuso, schemas (zod), erros, tipos de registro
  lib/reports/          builder (consolidação), pdf (jsPDF), hash (SHA-256)
  pages/                telas (carregadas sob demanda)
  services/             ÚNICA camada que fala com o Firebase
  types/                modelos de dados
functions/              Cloud Function opcional de IA (chave só no servidor)
tests/unit, tests/rules testes
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
scripts/                seed de demonstração (emulador) e criação do 1º admin
docs/                   documentação operacional
.github/workflows/      CI e deploys
```

## Documentação

- [Arquitetura e modelo de dados](docs/ARQUITETURA.md)
- [Criar e configurar o Firebase](docs/FIREBASE.md)
- [GitHub e deploy automático](docs/DEPLOY.md)
- [Integração de IA](docs/IA.md)
- [Checklist de segurança para produção](docs/SEGURANCA.md)
- [LGPD, retenção e validade jurídica](docs/LGPD.md)
- [Backup e restauração](docs/BACKUP.md)
- [Migrações de dados](docs/MIGRACOES.md)
- [Roteiro de testes](docs/TESTES.md)

## Limitações conhecidas (transparência)

- A busca textual avançada filtra no navegador os registros **já autorizados** do período (o Firestore não tem busca de texto livre). Para volumes muito grandes, integre um índice de busca (ex.: Algolia/Typesense) respeitando as permissões.
- Cadastro de pacientes e permissões: apenas administradores (conforme o perfil definido). Profissionais registram evoluções, laudos e relatórios dos pacientes aos quais têm acesso.
- Anexos e PDFs finalizados são imutáveis pelo cliente; a **retenção/descarte** é um procedimento operacional documentado, não automático.
- Sem assinatura digital qualificada (ICP-Brasil) — ver [docs/LGPD.md](docs/LGPD.md).
