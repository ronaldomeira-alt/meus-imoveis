# ==============================================================================
# SCRIPT DE CONFIGURAÇÃO AUTÔNOMA DO BOT CAPTADOR NA VM WINDOWS
# Executado dentro da Máquina Virtual via PowerShell
# ==============================================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 CONFIGURANDO BOT CAPTADOR 100% AUTÔNOMO NA VM" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Cria a estrutura de pastas padrão em C:\Projetos\meus-imoveis
$baseDir = "C:\Projetos\meus-imoveis"
$scriptsDir = "$baseDir\scripts"
$logsDir = "$baseDir\logs"

if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir -Force | Out-Null }
if (-not (Test-Path $scriptsDir)) { New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null }
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

Write-Host "📁 Diretório base configurado em: $baseDir" -ForegroundColor Green

# 1.1 Garante que o Node.js portátil esteja instalado no diretório do projeto
$nodeDir = "$baseDir\node"
$nodeCmd = "$nodeDir\node.exe"
$npmCmd = "$nodeDir\npm.cmd"

if (-not (Test-Path $nodeCmd)) {
  Write-Host "⚙️ Baixando Node.js v22 LTS portátil (não requer administrador)..." -ForegroundColor Yellow
  $nodeZip = "$baseDir\node.zip"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip" -OutFile $nodeZip -UseBasicParsing
  Write-Host "📦 Extraindo Node.js..." -ForegroundColor Yellow
  $tempExtract = "$baseDir\node_temp"
  if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
  Expand-Archive -Path $nodeZip -DestinationPath $tempExtract -Force
  if (-not (Test-Path $nodeDir)) { New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null }
  $inner = Get-ChildItem $tempExtract | Select-Object -First 1
  Copy-Item "$($inner.FullName)\*" -Destination $nodeDir -Recurse -Force
  Remove-Item $tempExtract -Recurse -Force
  Remove-Item $nodeZip -Force
  Write-Host "✅ Node.js v22 LTS configurado com sucesso em: $nodeDir" -ForegroundColor Green
}

# 2. Configura atalho do Chrome com porta de depuração remota e auto-start
Write-Host "🌐 Configurando atalhos do Google Chrome..." -ForegroundColor Yellow
$wsh = New-Object -ComObject WScript.Shell
$desktopChrome = $wsh.CreateShortcut("$env:USERPROFILE\Desktop\Google Chrome.lnk")
$desktopChrome.Arguments = "--remote-debugging-port=9222 --remote-allow-origins=*"
$desktopChrome.Save()

$startupChrome = $wsh.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Google Chrome.lnk")
$startupChrome.TargetPath = $desktopChrome.TargetPath
if (-not $startupChrome.TargetPath) {
  $startupChrome.TargetPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
}
$startupChrome.Arguments = "--remote-debugging-port=9222 --remote-allow-origins=*"
$startupChrome.Save()

# Inicia o Chrome com a porta de depuração se não estiver aberto
$chromeRunning = Get-Process chrome -ErrorAction SilentlyContinue
if (-not $chromeRunning) {
  Write-Host "🌐 Iniciando Google Chrome na VM com porta 9222..." -ForegroundColor Yellow
  Start-Process "chrome.exe" "--remote-debugging-port=9222 --remote-allow-origins=*"
  Start-Sleep -Seconds 4
}

# 3. Baixa o script executor atualizado do GitHub
Write-Host "📥 Baixando scripts mais recentes do Bot Captador..." -ForegroundColor Yellow
$executorUrl = "https://raw.githubusercontent.com/ronaldomeira-alt/meus-imoveis/master/scripts/olx-executor.mjs"
Invoke-WebRequest -Uri $executorUrl -OutFile "$scriptsDir\olx-executor.mjs" -UseBasicParsing

# 4. Cria arquivo .env com credenciais do Supabase
Write-Host "🔑 Configurando credenciais de ambiente (.env)..." -ForegroundColor Yellow
@'
VITE_SUPABASE_URL=https://qedptmrcvcbzhucoeznd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZHB0bXJjdmNiemh1Y29lem5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3OTUwMzgsImV4cCI6MjEwMTM3MTAzOH0.EB5KAhb601HiAO7y8EFWA53QepcxGlqyns33HoC816g
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZHB0bXJjdmNiemh1Y29lem5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTc5NTAzOCwiZXhwIjoyMTAxMzcxMDM4fQ.-zYj_z6kiaJpH43mOqV_OKlXf6Q6zUJhEJfBa5KKu0Q
MEUS_IMOVEIS_ACCOUNT_ID=52716edc-399e-4d4c-9788-0d6b04c0031f
MATCH_CANONICAL_ACCOUNT_ID=7f434d39-87d8-4d16-8262-e3006908d1c5
'@ | Set-Content -Path "$baseDir\.env" -Encoding utf8

# 5. Cria package.json mínimo e instala dependências
Write-Host "📦 Verificando dependências do Node.js..." -ForegroundColor Yellow
@'
{
  "name": "meus-imoveis-bot-vm",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1",
    "puppeteer-core": "^24.4.0"
  }
}
'@ | Set-Content -Path "$baseDir\package.json" -Encoding utf8

$nodeCmd = if (Test-Path "$nodeDir\node.exe") { "$nodeDir\node.exe" } elseif (Get-Command node -ErrorAction SilentlyContinue) { "node" } else { "C:\Program Files\nodejs\node.exe" }
$npmCmd = if (Test-Path "$nodeDir\npm.cmd") { "$nodeDir\npm.cmd" } elseif (Get-Command npm -ErrorAction SilentlyContinue) { "npm" } else { "C:\Program Files\nodejs\npm.cmd" }

Set-Location $baseDir
if (-not (Test-Path "$baseDir\node_modules\@supabase")) {
  Write-Host "Instalando dependências via npm..." -ForegroundColor Cyan
  & $npmCmd install --silent
}

# 6. Registra o Agendador de Tarefas do Windows (09:00 e 19:00)
Write-Host "⏰ Registrando Agendador de Tarefas do Windows..." -ForegroundColor Yellow
$taskName = "MeusImoveis-BotCaptador"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Set-Location '$baseDir'; & '$nodeCmd' scripts/olx-executor.mjs --run-round >> '$logsDir\bot-scheduler.log' 2>&1"""

$trigger1 = New-ScheduledTaskTrigger -Daily -At "09:00"
$trigger2 = New-ScheduledTaskTrigger -Daily -At "19:00"

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Description "Rodadas Oficiais Diárias do Bot Captador (09:00 e 19:00)" | Out-Null

Write-Host "✅ Tarefa '$taskName' agendada para 09:00 e 19:00 todos os dias!" -ForegroundColor Green

# 7. Executa teste de rodada imediatamente para validar
Set-Location $baseDir
Write-Host "`n🧪 Testando execução do Bot agora..." -ForegroundColor Cyan
& $nodeCmd scripts/olx-executor.mjs --run-round

Write-Host "`n🎉 TUDO PRONTO! O Bot está 100% autônomo e configurado na VM." -ForegroundColor Green
