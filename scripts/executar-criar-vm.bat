@echo off
echo ============================================================
echo   PROVISIONANDO AMBIENTE HYPER-V PARA O BOT CHROME
echo ============================================================
echo.
net localgroup "Administradores do Hyper-V" "%USERNAME%" /add >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Projetos\meus-imoveis\scripts\criar-vm-chrome.ps1"
echo.
pause
