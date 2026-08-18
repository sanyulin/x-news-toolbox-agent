param([string]$TaskName = "X News Toolbox Agent - Daily 10AM")

$ErrorActionPreference = "Stop"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  @{ exists = $false; taskName = $TaskName } | ConvertTo-Json
  exit 2
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName
$action = $task.Actions | Select-Object -First 1
@{
  exists = $true
  taskName = $TaskName
  state = [string]$task.State
  nextRunTime = $info.NextRunTime.ToString("o")
  lastRunTime = $info.LastRunTime.ToString("o")
  lastTaskResult = $info.LastTaskResult
  execute = $action.Execute
  arguments = $action.Arguments
  workingDirectory = $action.WorkingDirectory
} | ConvertTo-Json
