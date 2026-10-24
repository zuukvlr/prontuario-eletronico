# Sobe os emuladores (Auth, Firestore, Storage) usando o JDK 21 portátil, se existir.
$jdk = Join-Path $env:USERPROFILE 'jdk21-portatil\jdk-21.0.12.1+1'
if (Test-Path $jdk) { $env:JAVA_HOME = $jdk; $env:PATH = "$jdk\bin;$env:PATH" }
npm run emulators
