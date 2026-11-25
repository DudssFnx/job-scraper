# Fallback do scrape para o rodar-ia.bat.
# O agendamento do GitHub no fork e pouco confiavel (disparos raros) e o gatekeeper pula o
# scrape se ja houve um no dia. Se HOJE (fuso local) nao houver run do "Daily Job Scraper"
# com o job scrape-linkedin em success, dispara o workflow e espera ate 45 min.
# Saida: 0 = ja havia scrape hoje ou o disparo terminou com scrape-linkedin em success
#        1 = falhou (gh, timeout, run com falha ou scrape-linkedin nao rodou)
# Com -DryRun so mostra a decisao, sem disparar nada.
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$Repo = 'DudssFnx/job-scraper'
$Workflow = 'scrape_jobs.yml'
$TimeoutMin = 45

function Write-Log([string]$msg) { Write-Output ('[{0:dd/MM/yyyy HH:mm:ss}] [scrape-fallback] {1}' -f (Get-Date), $msg) }

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh -and (Test-Path 'C:\Program Files\GitHub CLI\gh.exe')) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
if (-not $gh) { Write-Log 'gh nao encontrado.'; exit 1 }

function Get-LinkedinConclusion([string]$runId) {
  $j = & $gh run view $runId -R $Repo --json jobs | ConvertFrom-Json
  $job = $j.jobs | Where-Object { $_.name -eq 'scrape-linkedin' } | Select-Object -First 1
  if ($job) { return [string]$job.conclusion } else { return 'ausente' }
}

try {
  $today = (Get-Date).Date
  $runs = & $gh run list -R $Repo --workflow $Workflow --limit 30 --json 'databaseId,createdAt,event,status' | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'gh run list falhou' }
  $todayRuns = @($runs | Where-Object { ([datetimeoffset]$_.createdAt).LocalDateTime.Date -eq $today })
  foreach ($r in $todayRuns) {
    $c = Get-LinkedinConclusion $r.databaseId
    Write-Log ("run de hoje {0} ({1}, {2}): scrape-linkedin = {3}" -f $r.databaseId, $r.event, $r.status, $c)
    if ($c -eq 'success') { Write-Log 'Ja houve scrape do LinkedIn hoje. Nada a fazer.'; exit 0 }
  }
  if ($todayRuns.Count -eq 0) { Write-Log 'Nenhum run do Daily Job Scraper hoje.' }

  if ($DryRun) { Write-Log 'DRY-RUN: dispararia o Daily Job Scraper agora.'; exit 0 }

  $before = & $gh run list -R $Repo --workflow $Workflow --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0'
  Write-Log 'Disparando o Daily Job Scraper (gh workflow run)...'
  & $gh workflow run $Workflow -R $Repo
  if ($LASTEXITCODE -ne 0) { throw 'gh workflow run falhou' }

  $runId = $null
  for ($i = 0; $i -lt 30 -and -not $runId; $i++) {
    Start-Sleep -Seconds 4
    $cur = & $gh run list -R $Repo --workflow $Workflow --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0'
    if ($cur -and $cur -ne '0' -and $cur -ne $before) { $runId = $cur }
  }
  if (-not $runId) { throw 'o run disparado nao apareceu em 2 min' }
  Write-Log "Run $runId criado. Esperando terminar (gh run watch, timeout $TimeoutMin min)..."

  $out = [IO.Path]::GetTempFileName(); $err = [IO.Path]::GetTempFileName()
  $p = Start-Process -FilePath $gh -ArgumentList @('run', 'watch', $runId, '-R', $Repo, '--exit-status', '--interval', '30') `
    -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  if (-not $p.WaitForExit($TimeoutMin * 60 * 1000)) {
    try { $p.Kill() } catch {}
    Remove-Item $out, $err -ErrorAction SilentlyContinue
    throw "timeout de $TimeoutMin min esperando o run $runId"
  }
  $watchExit = $p.ExitCode
  Remove-Item $out, $err -ErrorAction SilentlyContinue

  $c = Get-LinkedinConclusion $runId
  Write-Log "Run $runId terminou: gh run watch exit=$watchExit, scrape-linkedin = $c"
  if ($watchExit -eq 0 -and $c -eq 'success') { exit 0 }
  throw "run $runId sem scrape-linkedin em success"
}
catch {
  Write-Log ("FALHOU: {0}" -f $_.Exception.Message)
  exit 1
}
