@echo off
echo Adicionando %USERNAME% ao grupo Administradores do Hyper-V...
net localgroup "Administradores do Hyper-V" "%USERNAME%" /add
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCESSO] Seu usuario foi adicionado ao grupo Administradores do Hyper-V!
) else (
    echo.
    echo [AVISO] Execute este arquivo como Administrador para aplicar a permissao.
)
pause
