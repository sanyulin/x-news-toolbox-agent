param(
  [string]$TaskName = "X News Toolbox Agent - Daily 10AM",
  [string]$Time = "10:00",
  [string]$AgentRoot = "",
  [string]$NodeExe = "",
  [string]$CliPath = "",
  [switch]$Preview,
  [switch]$WakeToRun,
  [switch]$AllowCurrentTimeZone
)

$ErrorActionPreference = "Stop"
if ($Time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw "时间必须使用 HH:mm 格式" }

if (-not $AgentRoot) {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $AgentRoot = if (Test-Path -LiteralPath (Join-Path $projectRoot "dist\agent\cli.mjs")) { $projectRoot } else { $PSScriptRoot }
}
$AgentRoot = (Resolve-Path -LiteralPath $AgentRoot).Path

if (-not $CliPath) {
  $projectCli = Join-Path $AgentRoot "dist\agent\cli.mjs"
  $portableCli = Join-Path $AgentRoot "agent\cli.mjs"
  $CliPath = if (Test-Path -LiteralPath $projectCli) { $projectCli } else { $portableCli }
}
if (-not (Test-Path -LiteralPath $CliPath)) { throw "未找到 Agent CLI，请先运行 pnpm build:agent" }
$CliPath = (Resolve-Path -LiteralPath $CliPath).Path

if (-not $NodeExe) {
  $portableNode = Join-Path $AgentRoot "node.exe"
  $NodeExe = if (Test-Path -LiteralPath $portableNode) { $portableNode } else { (Get-Command node -ErrorAction Stop).Source }
}
$NodeExe = (Resolve-Path -LiteralPath $NodeExe).Path

$timeZone = Get-TimeZone
if (-not $AllowCurrentTimeZone -and $timeZone.Id -ne "China Standard Time") {
  throw "当前时区为 $($timeZone.Id)，不是 China Standard Time；请修正时区或显式使用 -AllowCurrentTimeZone"
}

$at = [datetime]::Today.Add([timespan]::Parse($Time))
$summary = [ordered]@{
  taskName = $TaskName
  time = $Time
  timeZone = $timeZone.Id
  nodeExe = $NodeExe
  cliPath = $CliPath
  workingDirectory = $AgentRoot
  startWhenAvailable = $true
  multipleInstances = "IgnoreNew"
  restart = "3 次，每次间隔 10 分钟"
  wakeToRun = [bool]$WakeToRun
  preview = [bool]$Preview
}

if ($Preview) {
  $summary | ConvertTo-Json
  exit 0
}

$action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$CliPath`" run-due" -WorkingDirectory $AgentRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $at
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 10) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RunOnlyIfNetworkAvailable `
  -WakeToRun:$WakeToRun
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
$summary["preview"] = $false
$summary["registered"] = $true
$summary | ConvertTo-Json
