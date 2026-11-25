@echo off
setlocal
title JobTrack - IA local (score + customize)

:: Roda a IA localmente pela assinatura do Claude (provider claude_cli):
:: 1) npm run score -- --limit 30   2) npm run customize -- --limit 5
:: Log diario em logs\ia-AAAA-MM-DD.log (append; duas execucoes no mesmo dia vao pro mesmo arquivo).
:: No fim escreve um resumo desta execucao e, se houver falha, abre um aviso no Windows.

cd /d "%~dp0"
if not exist "logs" mkdir "logs"

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "LOG=%~dp0logs\ia-%HOJE%.log"
set "RUNID=%RANDOM%%RANDOM%"
set "SUMFILE=%~dp0logs\ia-resumo.tmp"

echo.>> "%LOG%"
echo ============================================================>> "%LOG%"
echo [%DATE% %TIME%] Inicio RUN %RUNID%>> "%LOG%"

echo [%TIME%] npm run score -- --limit 30 ...
echo [%DATE% %TIME%] npm run score -- --limit 30>> "%LOG%"
call npm run score -- --limit 30 >> "%LOG%" 2>&1
set "SCORE_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] score exit=%SCORE_EXIT%>> "%LOG%"

:: Customize roda mesmo se o score falhar: pode haver vagas ja pontuadas esperando.
echo [%TIME%] npm run customize -- --limit 5 ...
echo [%DATE% %TIME%] npm run customize -- --limit 5>> "%LOG%"
call npm run customize -- --limit 5 >> "%LOG%" 2>&1
set "CUSTOM_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] customize exit=%CUSTOM_EXIT%>> "%LOG%"

:: Resumo so desta execucao (texto apos o marcador RUN %RUNID%). Exit code do PowerShell = total de falhas.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:LOG); $i=$t.LastIndexOf('RUN ' + $env:RUNID); if($i -ge 0){$t=$t.Substring($i)}; function S($p){$s=0; foreach($m in [regex]::Matches($t,$p)){$s+=[int]$m.Groups[1].Value}; $s}; $ok=S 'Successfully scored: (\d+)'; $sf=S 'Failed / Skipped: (\d+)'; $ct=S 'Successfully tailored: (\d+)'; $cf=S 'Successfully tailored: \d+ \| Failed: (\d+)'; $rp=[regex]::Matches($t,'JSON response was missing closer').Count; Write-Output ('Resumo: {0} pontuadas, {1} falhas no score, {2} curriculos gerados, {3} falhas no customize, {4} reparos de JSON' -f $ok,$sf,$ct,$cf,$rp); exit ($sf + $cf)" > "%SUMFILE%"
set "FALHAS=%ERRORLEVEL%"
set "RESUMO="
set /p RESUMO=<"%SUMFILE%"
del "%SUMFILE%" >nul 2>&1
if not defined RESUMO set "RESUMO=Resumo indisponivel (falha ao ler o log)"

echo [%DATE% %TIME%] %RESUMO%>> "%LOG%"
echo [%DATE% %TIME%] Fim RUN %RUNID% (score exit=%SCORE_EXIT% customize exit=%CUSTOM_EXIT%)>> "%LOG%"
echo %RESUMO%
echo Log: %LOG%

set "ALERTA=0"
if not "%FALHAS%"=="0" set "ALERTA=1"
if not "%SCORE_EXIT%"=="0" set "ALERTA=1"
if not "%CUSTOM_EXIT%"=="0" set "ALERTA=1"

:: Aviso nao bloqueante (Windows Home nao tem msg.exe): caixa de dialogo via PowerShell em processo separado.
if "%ALERTA%"=="1" start "" powershell -NoProfile -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show($env:RESUMO + [Environment]::NewLine + 'score exit=' + $env:SCORE_EXIT + '  customize exit=' + $env:CUSTOM_EXIT + [Environment]::NewLine + [Environment]::NewLine + 'Log: ' + $env:LOG, 'JobTrack - falhas na IA', 'OK', 'Warning')"

if "%ALERTA%"=="1" exit /b 1
exit /b 0
