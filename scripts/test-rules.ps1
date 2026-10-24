# Roda os testes das regras com o JDK 21 portátil (se existir) fora do sandbox.
$jdk = Join-Path $env:USERPROFILE 'jdk21-portatil\jdk-21.0.12.1+1'
if (Test-Path $jdk) { $env:JAVA_HOME = $jdk; $env:PATH = "$jdk\bin;$env:PATH" }
java -version
npm run test:rules -- --project demo-prontuario *>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot '..\rules-test-output.txt')
