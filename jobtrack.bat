@echo off
setlocal EnableExtensions
:: JobTrack - comando do dia a dia.  Uso: jobtrack [iniciar|app|status|log|candidatar|atualizar|ajuda]
:: Sem argumentos abre o menu. Nao guarda chaves: o acesso ao banco vem do web\.env.local.
:: Saida: 0 = ok, 1 = falha/aviso, 2 = comando desconhecido.

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "WEB=%ROOT%\web"
set "REPO=DudssFnx/job-scraper"
set "WF=scrape_jobs.yml"
set "APPURL=http://localhost:3000"
if exist "C:\Program Files\GitHub CLI\gh.exe" set "PATH=%PATH%;C:\Program Files\GitHub CLI"

if "%~1"=="" goto :menu
set "OPC=%~1"
if /i "%OPC%"=="start" set "OPC=iniciar"
if /i "%OPC%"=="help"  set "OPC=ajuda"
if "%OPC%"=="/?"       set "OPC=ajuda"
for %%c in (iniciar app status log candidatar atualizar ajuda) do if /i "%OPC%"=="%%c" (
  call :cmd_%%c
  exit /b
)
echo Comando desconhecido: %~1
echo.
call :cmd_ajuda
exit /b 2

:: ---------------------------------------------------------------- menu
:menu
echo.
echo ======================== JobTrack ========================
echo   1  Iniciar     (busca vagas na nuvem + score + curriculos)
echo   2  Abrir app   (build se preciso + localhost:3000)
echo   3  Status
echo   4  Ver log de hoje (ao vivo)
echo   5  Candidatar  (abre o Claude Code com o roteiro)
echo   6  Atualizar   (novidades do projeto original + build)
echo   0  Sair
echo ==========================================================
set "ESC="
set /p "ESC=Escolha: "
if "%ESC%"=="0" exit /b 0
set "ALVO="
if "%ESC%"=="1" set "ALVO=iniciar"
if "%ESC%"=="2" set "ALVO=app"
if "%ESC%"=="3" set "ALVO=status"
if "%ESC%"=="4" set "ALVO=log"
if "%ESC%"=="5" set "ALVO=candidatar"
if "%ESC%"=="6" set "ALVO=atualizar"
if not defined ALVO (
  echo Opcao invalida.
  goto :menu
)
call :cmd_%ALVO%
echo.
pause
goto :menu

:: ---------------------------------------------------------------- ajuda
:cmd_ajuda
echo Uso: jobtrack [comando]
echo.
echo   (sem comando)     abre o menu
echo   iniciar ^| start   busca vagas na nuvem, pontua, gera curriculos e mostra a fila
echo   app               abre o app em %APPURL% (faz o build se o codigo mudou)
echo   status            ultimo scrape, log, fila, tarefas agendadas e se o app esta no ar
echo   log               acompanha o log de hoje ao vivo (Ctrl+C para sair)
echo   candidatar        abre o Claude Code com o roteiro de candidaturas
echo   atualizar         traz as novidades do projeto original e refaz o build
echo   ajuda             mostra esta ajuda
exit /b 0

:: ---------------------------------------------------------------- iniciar
:cmd_iniciar
set "RUNID="
set "SCRAPE_FALHOU="
echo.
echo [1/3] Disparando o "Daily Job Scraper" no fork %REPO%...
set "ANTES=0"
for /f %%i in ('gh run list -R %REPO% --workflow %WF% --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId // 0"') do set "ANTES=%%i"
gh workflow run %WF% -R %REPO%
if errorlevel 1 goto :ini_scrape_falhou
set /a TENT=0
:ini_espera_run
set /a TENT+=1
set "ATUAL=0"
for /f %%i in ('gh run list -R %REPO% --workflow %WF% --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId // 0"') do set "ATUAL=%%i"
if not "%ATUAL%"=="0" if not "%ATUAL%"=="%ANTES%" set "RUNID=%ATUAL%"
if defined RUNID goto :ini_acompanha
if %TENT% GEQ 30 goto :ini_scrape_falhou
timeout /t 4 /nobreak >nul
goto :ini_espera_run

:ini_acompanha
echo Run novo: %RUNID%. Acompanhando ate terminar (costuma levar alguns minutos)...
gh run watch %RUNID% -R %REPO% --exit-status --interval 15
if errorlevel 1 goto :ini_scrape_falhou
set "NOVAS=?"
gh run view %RUNID% -R %REPO% --log > "%TEMP%\jobtrack-scrape.log" 2>nul
for /f %%n in ('powershell -NoProfile -Command "$m=[regex]::Matches([IO.File]::ReadAllText($env:TEMP+'\jobtrack-scrape.log'),'Total new jobs saved: (\d+)'); if($m.Count){$m[$m.Count-1].Groups[1].Value}else{'?'}"') do set "NOVAS=%%n"
del "%TEMP%\jobtrack-scrape.log" >nul 2>&1
echo Scrape concluido: %NOVAS% vaga(s) nova(s) (Sao Paulo).
goto :ini_ia

:ini_scrape_falhou
echo.
echo [AVISO] O scrape na nuvem falhou ou o run novo nao apareceu.
if defined RUNID echo Detalhes: gh run view %RUNID% -R %REPO% --log-failed
choice /c SN /n /m "Seguir so com o score e os curriculos das vagas que ja existem? [S/N] "
if errorlevel 2 (
  echo Cancelado.
  exit /b 1
)
set "SCRAPE_FALHOU=1"

:ini_ia
echo.
echo [2/3] IA local: score + curriculos (rodar-ia.bat). Pode levar varios minutos...
call "%ROOT%\rodar-ia.bat"
set "IA_EXIT=%ERRORLEVEL%"
echo.
echo [3/3] Fila de candidatura
call :fila
echo.
if not "%IA_EXIT%"=="0" (
  echo [AVISO] A IA terminou com falhas. Veja: jobtrack log  ou  jobtrack status
  exit /b 1
)
if defined SCRAPE_FALHOU exit /b 1
echo Pronto.
exit /b 0

:: ---------------------------------------------------------------- app
:cmd_app
set "HEADNOW="
for /f %%h in ('git -C "%ROOT%" rev-parse HEAD') do set "HEADNOW=%%h"
set "BUILT="
if exist "%WEB%\.next\BUILD_ID" if exist "%WEB%\.next\jobtrack-head.txt" set /p BUILT=<"%WEB%\.next\jobtrack-head.txt"
call :app_no_ar
if errorlevel 1 goto :app_subir
echo O app ja esta no ar em %APPURL%.
if not "%BUILT%"=="%HEADNOW%" echo [AVISO] O codigo mudou desde o ultimo build. Feche a janela "JobTrack app" e rode "jobtrack app" de novo.
start "" "%APPURL%"
exit /b 0

:app_subir
if "%BUILT%"=="%HEADNOW%" goto :app_start
echo Fazendo o build do app (ainda nao ha build, ou o codigo mudou)...
pushd "%WEB%"
call npm run build
if errorlevel 1 (
  popd
  echo [ERRO] O build falhou. Veja as mensagens acima.
  exit /b 1
)
>"%WEB%\.next\jobtrack-head.txt" echo %HEADNOW%
popd

:app_start
echo Iniciando o app na janela "JobTrack app". Para parar o app, feche essa janela.
start "JobTrack app" /d "%WEB%" cmd /k npm run start
set /a TENT=0
:app_espera
set /a TENT+=1
timeout /t 2 /nobreak >nul
call :app_no_ar
if not errorlevel 1 goto :app_abre
if %TENT% GEQ 30 (
  echo [ERRO] O app nao respondeu em 60s. Veja a janela "JobTrack app".
  exit /b 1
)
goto :app_espera
:app_abre
echo App no ar: %APPURL%
start "" "%APPURL%"
exit /b 0

:: ---------------------------------------------------------------- status (so leitura)
:cmd_status
echo.
echo ===== Ultimo scrape na nuvem (%REPO%) =====
gh run list -R %REPO% --workflow %WF% --limit 1 --json createdAt,status,conclusion,event --jq ".[] | [.createdAt, .status, .conclusion, .event] | @tsv"
if errorlevel 1 echo [AVISO] Nao consegui consultar o GitHub (gh ou rede).
echo.
echo ===== Log mais recente =====
powershell -NoProfile -Command "$f = Get-ChildItem -Path '%ROOT%\logs' -Filter 'ia-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if (-not $f) { 'Nenhum log ainda.'; exit 0 }; 'Arquivo: ' + $f.FullName; '--- ultimas 15 linhas ---'; Get-Content -LiteralPath $f.FullName -Tail 15 -Encoding UTF8; $r = Select-String -LiteralPath $f.FullName -Pattern 'Resumo:' -Encoding UTF8 | Select-Object -Last 1; '--- ultimo resumo ---'; if ($r) { $r.Line } else { '(sem resumo: a execucao nao terminou ou falhou antes)' }"
echo.
echo ===== Fila de candidatura =====
call :fila
echo.
echo ===== Tarefas agendadas =====
powershell -NoProfile -Command "foreach ($n in 'IA 08h30','IA 13h30') { $i = Get-ScheduledTaskInfo -TaskPath '\JobTrack\' -TaskName $n -ErrorAction SilentlyContinue; if (-not $i) { $n + ': nao encontrada'; continue }; $c = [int64]$i.LastTaskResult; $r = if ($c -eq 0) {'ok'} elseif ($c -eq 267011) {'ainda nao rodou'} elseif ($c -eq 267009) {'rodando agora'} elseif ($c -eq 1) {'terminou com falhas (veja o log)'} elseif ($c -eq 2147946720 -or $c -eq -2147020576) {'recusada pelo Windows (bateria ou sessao bloqueada)'} else {'codigo ' + $c}; '{0}: ultima {1:dd/MM HH:mm} = {2} | proxima {3:dd/MM HH:mm}' -f $n, $i.LastRunTime, $r, $i.NextRunTime }"
echo.
echo ===== App local =====
call :app_no_ar
if errorlevel 1 (echo Fora do ar. Para abrir: jobtrack app) else (echo No ar: %APPURL%)
exit /b 0

:: ---------------------------------------------------------------- log
:cmd_log
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "LOGF=%ROOT%\logs\ia-%HOJE%.log"
if not exist "%LOGF%" (
  echo Ainda nao ha log hoje: %LOGF%
  exit /b 1
)
echo Acompanhando %LOGF%  (Ctrl+C para sair)
powershell -NoProfile -Command "Get-Content -LiteralPath $env:LOGF -Wait -Tail 30 -Encoding UTF8"
exit /b 0

:: ---------------------------------------------------------------- candidatar
:cmd_candidatar
if not exist "%ROOT%\candidaturas\PROMPT-CANDIDATURAS.md" (
  echo [ERRO] Nao achei candidaturas\PROMPT-CANDIDATURAS.md
  exit /b 1
)
where claude >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Claude Code nao encontrado no PATH.
  exit /b 1
)
pushd "%ROOT%"
call claude "Leia candidaturas\PROMPT-CANDIDATURAS.md e execute"
set "CL_EXIT=%ERRORLEVEL%"
popd
exit /b %CL_EXIT%

:: ---------------------------------------------------------------- atualizar
:cmd_atualizar
call :app_no_ar
if not errorlevel 1 (
  echo [AVISO] Feche a janela "JobTrack app" antes de atualizar: o build nao pode rodar com o app aberto.
  exit /b 1
)
call "%ROOT%\atualizar-jobtrack.bat"
if errorlevel 1 (
  echo [AVISO] A atualizacao nao terminou. O build nao foi refeito.
  exit /b 1
)
echo Refazendo o build do app...
pushd "%WEB%"
call npm run build
if errorlevel 1 (
  popd
  echo [ERRO] O build falhou.
  exit /b 1
)
for /f %%h in ('git -C "%ROOT%" rev-parse HEAD') do >"%WEB%\.next\jobtrack-head.txt" echo %%h
popd
echo Atualizado e build refeito. Para abrir: jobtrack app
exit /b 0

:: ---------------------------------------------------------------- auxiliares
:fila
pushd "%WEB%"
call "%WEB%\node_modules\.bin\tsx.cmd" scripts\jobtrack-fila.ts
set "FILA_EXIT=%ERRORLEVEL%"
popd
exit /b %FILA_EXIT%

:app_no_ar
powershell -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { if ($c.ConnectAsync('localhost', 3000).Wait(1500) -and $c.Connected) { exit 0 } else { exit 1 } } catch { exit 1 } finally { $c.Close() }" >nul 2>&1
exit /b %ERRORLEVEL%
