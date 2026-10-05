@echo off
echo ============================================================
echo   ATIVACAO DO MICROSOFT HYPER-V NO WINDOWS 11 PRO
echo ============================================================
echo.
echo Solicitando elevacao de Administrador...
powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All\"' -Verb RunAs"
