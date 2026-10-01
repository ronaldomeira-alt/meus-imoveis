# ==============================================================================
# CONFIGURAÇÃO AUTÔNOMA DO GOOGLE CHROME PARA DEPURAÇÃO PERMANENTE
# Adiciona as flags oficiais --remote-debugging-port=9222 e --remote-allow-origins="*"
# nos atalhos do Chrome no Windows.
# ==============================================================================

$wsh = New-Object -ComObject WScript.Shell

$shortcutPaths = @(
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Google Chrome.lnk'),
    (Join-Path $env:USERPROFILE 'Desktop\Google Chrome.lnk'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Google Chrome.lnk')
)

$flagPort = '--remote-debugging-port=9222'
$flagOrigin = '--remote-allow-origins="*"'

foreach ($path in $shortcutPaths) {
    if (Test-Path $path) {
        Write-Host "Localizado atalho: $path"
        $shortcut = $wsh.CreateShortcut($path)
        
        $currentArgs = $shortcut.Arguments
        Write-Host "Argumentos atuais: $currentArgs"
        
        $newArgs = $currentArgs
        if ($newArgs -notlike "*$flagPort*") {
            $newArgs = "$newArgs $flagPort".Trim()
        }
        if ($newArgs -notlike "*remote-allow-origins*") {
            $newArgs = "$newArgs $flagOrigin".Trim()
        }
        
        $shortcut.Arguments = $newArgs
        $shortcut.Save()
        Write-Host "✅ Atualizado com sucesso para: $newArgs`n"
    }
}

$desktopPath = Join-Path $env:USERPROFILE 'Desktop\Google Chrome.lnk'
$chromeExe = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (!(Test-Path $desktopPath) -and (Test-Path $chromeExe)) {
    Write-Host "Criando atalho na Área de Trabalho com flags de depuração permanente..."
    $scDesktop = $wsh.CreateShortcut($desktopPath)
    $scDesktop.TargetPath = $chromeExe
    $scDesktop.Arguments = "$flagPort $flagOrigin"
    $scDesktop.IconLocation = "$chromeExe,0"
    $scDesktop.Save()
    Write-Host "✅ Atalho da Área de Trabalho criado com sucesso!`n"
}

Write-Host "🎉 Configuração de depuração permanente concluída!"
