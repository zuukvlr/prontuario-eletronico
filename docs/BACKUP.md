# Backup, recuperação e exportação

Os dados vivem no Firebase; o GitHub **não** tem backup do banco. Configure e **teste a restauração** antes do uso real.

## 1. Proteção contínua (recomendado)

- **Point-in-Time Recovery (PITR):** Console → Firestore → *Recuperação* (retém 7 dias; permite ler/restaurar qualquer minuto).
  ```bash
  gcloud firestore databases update --database='(default)' --enable-pitr
  ```
- **Exclusão protegida:** `gcloud firestore databases update --database='(default)' --delete-protection`.

## 2. Backups agendados

```bash
# diário, retenção de 14 semanas
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w
# semanal, retenção longa
gcloud firestore backups schedules create --database='(default)' --recurrence=weekly --day-of-week=SUNDAY --retention=52w
gcloud firestore backups schedules list --database='(default)'
```

## 3. Exportação para bucket (cópia fria)

```bash
gcloud firestore export gs://SEU-BUCKET-DE-BACKUP/$(date +%F) --database='(default)'
```
Use um bucket **privado**, em `southamerica-east1`, com *Object Versioning*, retenção/bloqueio e acesso restrito ao IAM da equipe responsável. Os anexos do Storage (`patients/…`) devem ter cópia equivalente (`gsutil -m rsync -r gs://BUCKET_APP gs://BUCKET_BACKUP/storage`) ou versionamento ativado.

## 4. Restauração

1. **Nunca restaure por cima da produção.** Restaure em um banco novo:
   ```bash
   gcloud firestore databases restore --source-backup=projects/PROJ/locations/southamerica-east1/backups/ID --destination-database=restauracao-AAAAMMDD
   # ou, a partir de PITR:
   gcloud firestore databases clone --source-database='projects/PROJ/databases/(default)' --snapshot-time=2026-10-05T14:00:00Z --destination-database=restauracao-AAAAMMDD
   ```
2. Valide os dados (contagem de pacientes/registros, amostras) com o responsável.
3. Se for substituir a produção, faça-o em janela combinada, com a aplicação em manutenção, e registre o incidente.
4. Importação de exportação: `gcloud firestore import gs://BUCKET/AAAA-MM-DD --database=restauracao-…`.

## 5. Exportação individual (titular)

*Configurações → Exportação de dados do titular* gera JSON com cadastro, registros, adendos e relatórios (registrado na auditoria). Trate o arquivo como dado sensível: transmitir por canal seguro e não guardar em locais sem controle.

## 6. Rotina e teste

| Frequência | Ação |
|---|---|
| Diária | Backup agendado automático; alerta em falha |
| Mensal | Conferir lista de backups e tamanho |
| **Trimestral** | **Teste de restauração** em banco de teste, anotando o tempo e quaisquer falhas |
| Em mudanças de estrutura | Backup manual antes (docs/MIGRACOES.md) |
