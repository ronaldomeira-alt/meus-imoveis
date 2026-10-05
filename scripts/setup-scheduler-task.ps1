# ==============================================================================
# CONFIGURADOR DO AGENDADOR NATIVO DO WINDOWS — BOT CAPTADOR
# Registra os dois disparos oficiais diários (09:00 e 19:00)
# ==============================================================================

$taskName = "MeusImoveis-BotCaptador"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Set-Location 'C:\Projetos\meus-imoveis'; node --use-system-ca scripts/olx-executor.mjs --run-round >> 'C:\Projetos\meus-imoveis\logs\bot-scheduler.log' 2>&1"""

$trigger1 = New-ScheduledTaskTrigger -Daily -At "09:00"
$trigger2 = New-ScheduledTaskTrigger -Daily -At "19:00"

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Description "Execução oficial programada do Bot Captador (09:00 e 19:00)"

Write-Host "✅ Tarefa agendada '$taskName' registrada com sucesso no Windows!"
