@echo off
setlocal
title JobTrack - IA local (score + customize)

:: Roda a IA localmente pela assinatura do Claude (provider claude_cli):
:: 1) npm run score   2) npm run customize -- --limit 8
:: Log diario em logs\ia-AAAA-MM-DD.log (append; duas execucoes no mesmo dia vao pro mesmo arquivo).

cd /d "%~dp0"
if not exist "logs" mkdir "logs"

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "LOG=%~dp0logs\ia-%HOJE%.log"

echo.>> "%LOG%"
echo ============================================================>> "%LOG%"
echo [%DATE% %TIME%] Inicio>> "%LOG%"

echo [%TIME%] npm run score ...
echo [%DATE% %TIME%] npm run score>> "%LOG%"
call npm run score >> "%LOG%" 2>&1
set "SCORE_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] score exit=%SCORE_EXIT%>> "%LOG%"

:: Customize roda mesmo se o score falhar: pode haver vagas ja pontuadas esperando.
echo [%TIME%] npm run customize -- --limit 8 ...
echo [%DATE% %TIME%] npm run customize -- --limit 8>> "%LOG%"
call npm run customize -- --limit 8 >> "%LOG%" 2>&1
set "CUSTOM_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] customize exit=%CUSTOM_EXIT%>> "%LOG%"

echo [%DATE% %TIME%] Fim (score=%SCORE_EXIT% customize=%CUSTOM_EXIT%)>> "%LOG%"
echo Concluido. score=%SCORE_EXIT% customize=%CUSTOM_EXIT%  Log: %LOG%

if not "%SCORE_EXIT%"=="0" exit /b 1
if not "%CUSTOM_EXIT%"=="0" exit /b 1
exit /b 0
