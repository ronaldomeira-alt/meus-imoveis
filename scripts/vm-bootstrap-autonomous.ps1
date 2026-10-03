# ==============================================================================
# SCRIPT DE BOOTSTRAP AUTÔNOMO DEFINITIVO NA VM HYPER-V
# ==============================================================================

$baseDir = "C:\Projetos\meus-imoveis"
$scriptsDir = "$baseDir\scripts"
$logsDir = "$baseDir\logs"
$logFile = "$logsDir\bootstrap.log"

if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir -Force | Out-Null }
if (-not (Test-Path $scriptsDir)) { New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null }
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

function Log($msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

Log "🚀 INICIANDO CONFIGURAÇÃO DEFINITIVA DO BOT CAPTADOR NA VM"

# 1. Ajuste do Firewall para permitir checagem do host
try {
    Log "🛡️ Configurando regras de Firewall na VM..."
    netsh advfirewall firewall add rule name="ChromeDebug_9222" dir=in action=allow protocol=TCP localport=9222 | Out-Null
    netsh advfirewall firewall add rule name="ICMP_Ping" dir=in action=allow protocol=icmpv4:8,any | Out-Null
    Log "✅ Firewall configurado."
} catch {
    Log "⚠️ Aviso Firewall: $($_.Exception.Message)"
}

# 2. Instalação e verificação do Google Chrome
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromeExe = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromeExe) {
    Log "🌐 Google Chrome não encontrado. Baixando instalador autônomo oficial..."
    $chromeInstaller = "$baseDir\ChromeSetup.exe"
    try {
        Invoke-WebRequest -Uri "https://dl.google.com/chrome/install/standalonesetup64.exe" -OutFile $chromeInstaller -UseBasicParsing -TimeoutSec 60
        Log "📦 Executando instalador silencioso do Chrome..."
        Start-Process -FilePath $chromeInstaller -ArgumentList "/silent", "/install" -Wait
        Remove-Item $chromeInstaller -Force -ErrorAction SilentlyContinue
    } catch {
        Log "❌ Erro ao baixar Chrome: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 5
    $chromeExe = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if ($chromeExe) {
    Log "✅ Google Chrome localizado em: $chromeExe"
} else {
    Log "❌ Google Chrome ainda não disponível. Tentando usar msedge..."
    $chromeExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

# 3. Configuração dos Atalhos com porta 9222 persistente
$wsh = New-Object -ComObject WScript.Shell

# Desktop público (visível a todos os usuários)
$desktopShort = $wsh.CreateShortcut("C:\Users\Public\Desktop\Google Chrome.lnk")
$desktopShort.TargetPath = $chromeExe
$desktopShort.Arguments = "--remote-debugging-port=9222 --remote-allow-origins=*"
$desktopShort.Save()

# Inicialização do usuário atual e de todos os usuários
$startupShort = $wsh.CreateShortcut("C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\Google Chrome.lnk")
$startupShort.TargetPath = $chromeExe
$startupShort.Arguments = "--remote-debugging-port=9222 --remote-allow-origins=*"
$startupShort.Save()
Log "✅ Atalhos do Chrome criados com porta 9222 e persistência no Startup."

# 4. Inicia o Chrome com a porta 9222
Log "🌐 Reiniciando Google Chrome na VM com porta 9222..."
Get-Process chrome, msedge -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Start-Process -FilePath $chromeExe -ArgumentList "--remote-debugging-port=9222", "--remote-allow-origins=*"
Start-Sleep -Seconds 5

$port9222Ok = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            $port9222Ok = $true
            Log "✅ Porta 9222 respondendo com sucesso! Versão: $($res.Content)"
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $port9222Ok) {
    Log "⚠️ Porta 9222 ainda não respondeu na checagem local."
}

# 5. Configuração do Node.js
$nodeCmd = "node"
$nodeInstalled = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeInstalled) {
    if (Test-Path "$baseDir\node\node.exe") {
        $nodeCmd = "$baseDir\node\node.exe"
        Log "✅ Usando Node.js local: $nodeCmd"
    } else {
        Log "⚙️ Baixando Node.js v22 portátil..."
        $nodeZip = "$baseDir\node.zip"
        try {
            Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip" -OutFile $nodeZip -UseBasicParsing
            Expand-Archive -Path $nodeZip -DestinationPath "$baseDir\node_temp" -Force
            $inner = Get-ChildItem "$baseDir\node_temp" | Select-Object -First 1
            New-Item -ItemType Directory -Path "$baseDir\node" -Force | Out-Null
            Copy-Item "$($inner.FullName)\*" -Destination "$baseDir\node" -Recurse -Force
            Remove-Item "$baseDir\node_temp", $nodeZip -Recurse -Force
            $nodeCmd = "$baseDir\node\node.exe"
            Log "✅ Node.js v22 portátil instalado com sucesso!"
        } catch {
            Log "❌ Erro ao baixar Node.js: $($_.Exception.Message)"
        }
    }
} else {
    $nodeCmd = $nodeInstalled.Source
    Log "✅ Node.js encontrado no sistema: $nodeCmd"
}

# 6. Descompactar dependências se arquivo zip transferido estiver presente
if (Test-Path "$baseDir\node_modules.zip") {
    Log "📦 Extraindo dependências (node_modules)..."
    Expand-Archive -Path "$baseDir\node_modules.zip" -DestinationPath $baseDir -Force
    Remove-Item "$baseDir\node_modules.zip" -Force -ErrorAction SilentlyContinue
    Log "✅ node_modules descompactado."
}

# 7. Execução do Teste --scan
Log "🧪 Executando teste do Bot Captador: --scan..."
Set-Location $baseDir
$scanLogPath = "$logsDir\scan-test.log"

try {
    & $nodeCmd scripts/olx-executor.mjs --scan > $scanLogPath 2>&1
    $scanOutput = Get-Content $scanLogPath -Raw -ErrorAction SilentlyContinue
    Log "📊 Resultado do scan:`n$scanOutput"
} catch {
    Log "❌ Erro na execução do scan: $($_.Exception.Message)"
}

# 8. Configuração da Tarefa Agendada no Windows da VM (09:00 e 19:00)
Log "⏰ Configurando Tarefa Agendada 'MeusImoveis-BotCaptador' na VM..."
$taskName = "MeusImoveis-BotCaptador"
$actionCmd = "-ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Set-Location '$baseDir'; & '$nodeCmd' scripts/olx-executor.mjs --run-round >> '$logsDir\bot-scheduler.log' 2>&1"""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionCmd

$trigger1 = New-ScheduledTaskTrigger -Daily -At "09:00"
$trigger2 = New-ScheduledTaskTrigger -Daily -At "19:00"

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Description "Rodadas Oficiais Diárias do Bot Captador (09:00 e 19:00)" | Out-Null

$taskCheck = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($taskCheck) {
    Log "✅ Tarefa '$taskName' agendada com SUCESSO na VM para 09:00 e 19:00 diariamente!"
} else {
    Log "❌ Falha ao registrar tarefa agendada na VM."
}

# 9. Conclusão e geração do resumo final
$resultSummary = @{
    completed_at = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    chrome_path = $chromeExe
    port_9222_active = $port9222Ok
    node_path = $nodeCmd
    task_registered = [bool]$taskCheck
    task_name = $taskName
    triggers = @("09:00", "19:00")
}

$resultJson = $resultSummary | ConvertTo-Json -Depth 3
Set-Content -Path "$logsDir\vm-ready.json" -Value $resultJson -Encoding utf8
Set-Content -Path "C:\bot-bootstrap-done.txt" -Value $resultJson -Encoding utf8

Log "🎉 CONFIGURAÇÃO DA VM CONCLUÍDA COM SUCESSO!"
