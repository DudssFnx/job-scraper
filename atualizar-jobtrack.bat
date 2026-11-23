@echo off
setlocal
title Atualizar JobTrack (fork com patch pt-BR)

:: Atualiza o fork rebaseando os commits locais (patch pt-BR) sobre upstream/main.
:: Estrutura linear com "if errorlevel" + goto para evitar o bug de %%errorlevel%% em blocos.

cd /d "%~dp0"
set GIT_TERMINAL_PROMPT=0

echo ============================================================
echo   JobTrack - atualizacao do fork (rebase sobre upstream)
echo ============================================================
echo.

:: 1. Precisa estar na branch main
set "BRANCH="
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
if /i not "%BRANCH%"=="main" goto :not_main

:: 2. Aborta se houver mudancas nao commitadas (arquivos rastreados)
git diff --quiet
if errorlevel 1 goto :dirty
git diff --cached --quiet
if errorlevel 1 goto :dirty

:: 3. Garante o remote upstream
git remote get-url upstream >nul 2>&1
if errorlevel 1 git remote add upstream https://github.com/anandanair/job-scraper.git

echo [1/4] Buscando novidades do upstream...
git fetch upstream
if errorlevel 1 goto :fetch_fail

echo [2/4] Rebase dos seus commits sobre upstream/main...
git rebase upstream/main
if errorlevel 1 goto :conflict

echo [3/4] Atualizando dependencias (npm run install:web)...
call npm run install:web
if errorlevel 1 goto :npm_fail

echo [4/4] Enviando para o seu fork (push --force-with-lease)...
git push --force-with-lease origin main
if errorlevel 1 goto :push_fail

echo.
echo ============================================================
echo   Atualizado
echo ============================================================
git log --oneline upstream/main..HEAD
echo.
pause
exit /b 0

:not_main
echo [ERRO] Voce esta na branch "%BRANCH%". Volte para a main: git switch main
goto :fail

:dirty
echo [ERRO] Ha mudancas nao commitadas. Commite ou descarte antes de atualizar.
git status --short
goto :fail

:fetch_fail
echo [ERRO] Nao foi possivel buscar o upstream. Verifique a internet.
goto :fail

:conflict
git rebase --abort
echo.
echo [CONFLITO] conflito, abra o Claude Code para resolver
echo Nada foi alterado: o rebase foi desfeito e sua main continua como antes.
goto :fail

:npm_fail
echo [ERRO] Falha no npm install. O rebase local foi feito, mas NADA foi enviado ao fork.
echo Corrija o erro acima e rode este script de novo.
goto :fail

:push_fail
echo [ERRO] O push para o fork falhou (o fork mudou desde o ultimo fetch, ou sem rede).
echo Sua copia local esta atualizada; rode o script de novo ou abra o Claude Code.
goto :fail

:fail
echo.
pause
exit /b 1
