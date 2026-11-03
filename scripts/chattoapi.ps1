[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('menu', 'start', 'stop', 'restart', 'status', 'monitor', 'adopt')]
    [string]$Command = 'menu',

    [ValidateRange(1, 3600)]
    [int]$IntervalSeconds = 5,

    [ValidateRange(5, 300)]
    [int]$StartupTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RunDirectory = Join-Path $ProjectRoot '.chattoapi-run'
$StateFile = Join-Path $RunDirectory 'process.json'
$StdOutLog = Join-Path $RunDirectory 'stdout.log'
$StdErrLog = Join-Path $RunDirectory 'stderr.log'
$LauncherLog = Join-Path $RunDirectory 'launcher.log'
$LauncherErrLog = Join-Path $RunDirectory 'launcher-error.log'
$PidFile = Join-Path $RunDirectory 'child.pid'

function Ensure-RunDirectory {
    if (-not (Test-Path -LiteralPath $RunDirectory)) {
        New-Item -ItemType Directory -Path $RunDirectory -Force | Out-Null
    }
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Get-Endpoint {
    $hostName = if ($env:CHATTOAPI_HOST) { $env:CHATTOAPI_HOST } else { '127.0.0.1' }
    $port = if ($env:CHATTOAPI_PORT) { [int]$env:CHATTOAPI_PORT } else { 8787 }
    $configPath = Join-Path $ProjectRoot 'config.json'
    if ((-not $env:CHATTOAPI_HOST) -and (Test-Path -LiteralPath $configPath)) {
        try { $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } catch { $config = $null }
        if ((-not $env:CHATTOAPI_HOST) -and $config -and $config.host) { $hostName = [string]$config.host }
        if ((-not $env:CHATTOAPI_PORT) -and $config -and $config.port) { $port = [int]$config.port }
    }
    return [pscustomobject]@{
        Host = $hostName
        Port = $port
        Url = "http://$hostName`:$port"
    }
}

function Get-State {
    $state = Read-JsonFile $StateFile
    if ($state -and $state.pid) { return $state }
    return $null
}

function Get-ManagedProcess([object]$State) {
    if (-not $State -or -not $State.pid) { return $null }
    try { $process = Get-Process -Id ([int]$State.pid) -ErrorAction Stop } catch { return $null }
    if ($State.startedAt) {
        try {
            $expectedStart = [DateTimeOffset]::Parse([string]$State.startedAt).DateTime
            if ([Math]::Abs(($process.StartTime - $expectedStart).TotalSeconds) -gt 5) { return $null }
        } catch {
            # Ignore malformed or unavailable process timestamps.
        }
    }
    return $process
}

function Test-Health([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri "$Url/health" -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Remove-State {
    if (Test-Path -LiteralPath $StateFile) {
        Remove-Item -LiteralPath $StateFile -Force
    }
}

function Show-Status {
    $state = Get-State
    $endpoint = if ($state -and $state.url) {
        [pscustomobject]@{ Host = $state.host; Port = [int]$state.port; Url = [string]$state.url }
    } else { Get-Endpoint }
    $process = Get-ManagedProcess $state
    $running = $null -ne $process
    $healthy = $running -and (Test-Health $endpoint.Url)
    [pscustomobject]@{
        Running = $running
        Healthy = $healthy
        Pid = if ($running) { $process.Id } else { $null }
        Host = $endpoint.Host
        Port = $endpoint.Port
        Url = $endpoint.Url
        StartedAt = if ($state) { $state.startedAt } else { $null }
        StateFile = $StateFile
        StdOutLog = $StdOutLog
        StdErrLog = $StdErrLog
    }
}

function Get-ListeningProcessId([int]$Port) {
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -First 1
        if ($connection -and $connection.OwningProcess) { return [int]$connection.OwningProcess }
    } catch { }
    try {
        $line = netstat.exe -ano -p tcp | Select-String (":$Port\s+.*LISTENING\s+(\d+)$") | Select-Object -First 1
        if ($line -and $line.Matches.Count -gt 0) { return [int]$line.Matches[0].Groups[1].Value }
    } catch { }
    return $null
}

function Adopt-ExistingService {
    $endpoint = Get-Endpoint
    if (-not (Test-Health $endpoint.Url)) {
        throw "No healthy ChatToAPI service is responding at $($endpoint.Url)."
    }
    $processId = Get-ListeningProcessId $endpoint.Port
    if (-not $processId) {
        throw "Could not identify the process listening on port $($endpoint.Port). Run this shell with permission to inspect TCP connections."
    }
    try { $process = Get-Process -Id $processId -ErrorAction Stop } catch { throw "Could not open the listening process (PID $processId)." }
    if ($process.ProcessName -notmatch '(?i)^node$') {
        throw "Port $($endpoint.Port) is owned by $($process.ProcessName), not Node.js; adoption was cancelled."
    }
    Ensure-RunDirectory
    $state = [ordered]@{
        pid = $processId
        host = $endpoint.Host
        port = $endpoint.Port
        url = $endpoint.Url
        startedAt = $process.StartTime.ToString('o')
        adoptedAt = (Get-Date).ToString('o')
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
    Write-Host "Existing Node service adopted (PID $processId): $($endpoint.Url)"
}

function Start-ChatToApiService([switch]$ExitAfterStart) {
    Ensure-RunDirectory
    $existingState = Get-State
    $existingProcess = Get-ManagedProcess $existingState
    if ($existingProcess) {
        $existingEndpoint = if ($existingState.url) { $existingState.url } else { (Get-Endpoint).Url }
        if (Test-Health $existingEndpoint) {
            Write-Host "ChatToAPI is already running (PID $($existingProcess.Id)): $existingEndpoint"
            return
        }
        throw "A managed ChatToAPI process already exists (PID $($existingProcess.Id)) but /health is not ready. Check $StdErrLog."
    }
    if ($existingState) { Remove-State }

    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
    if (-not $node) { throw 'Node.js was not found on PATH. Install Node.js 20+ first.' }
    $endpoint = Get-Endpoint
    if (Test-Health $endpoint.Url) {
        throw "The endpoint $($endpoint.Url) is already responding. Set CHATTOAPI_PORT to another port or stop the existing service first."
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    $daemonPath = Join-Path $ProjectRoot 'scripts/daemon.mjs'
    $launchCommand = 'start "" /b "' + $node.Source + '" "' + $daemonPath + '" "' + $ProjectRoot + '" "' + $StdOutLog + '" "' + $StdErrLog + '" "' + $PidFile + '"'
    $launcherInfo = New-Object System.Diagnostics.ProcessStartInfo
    $launcherInfo.FileName = $env:ComSpec
    $launcherInfo.Arguments = '/d /c ' + $launchCommand
    $launcherInfo.WorkingDirectory = $ProjectRoot
    $launcherInfo.CreateNoWindow = $true
    $launcherInfo.UseShellExecute = $false
    $launcherProcess = [System.Diagnostics.Process]::Start($launcherInfo)
    $launcherProcess.Dispose()
    Start-Sleep -Milliseconds 500
    if (-not (Test-Path -LiteralPath $PidFile)) {
        throw "Could not start the detached Node process. Check $StdErrLog."
    }
    $pidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if (-not ($pidText -as [int])) { throw "Could not identify the detached Node process. Check $LauncherLog." }
    $processId = [int]$pidText
    $state = [ordered]@{
        pid = $processId
        host = $endpoint.Host
        port = $endpoint.Port
        url = $endpoint.Url
        startedAt = (Get-Date).ToString('o')
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8

    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 500
        if (Test-Health $endpoint.Url) {
            $process = Get-ManagedProcess ([pscustomobject]$state)
            if (-not $process) {
                Remove-State
                throw "ChatToAPI is healthy but its detached Node process is no longer running. Check $StdErrLog."
            }
            $state | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
            Write-Host "ChatToAPI started (PID $processId): $($endpoint.Url)"
            Write-Host "Logs: $StdOutLog"
            if ($ExitAfterStart) { exit 0 }
            return
        }
    } while ((Get-Date) -lt $deadline)
    Remove-State
    throw "ChatToAPI did not become healthy within $StartupTimeoutSeconds seconds. Check $StdErrLog."
}

function Stop-ChatToApiService {
    $state = Get-State
    $process = Get-ManagedProcess $state
    if (-not $process) {
        if ($state) { Remove-State }
        Write-Host 'ChatToAPI is not running.'
        return
    }
    $processId = $process.Id
    Stop-Process -Id $processId -ErrorAction Stop
    try { Wait-Process -Id $processId -Timeout 10 -ErrorAction Stop } catch { }
    if (Get-ManagedProcess $state) {
        Stop-Process -Id $processId -Force -ErrorAction Stop
    }
    Remove-State
    Write-Host "ChatToAPI stopped (PID $processId)."
}

function Monitor-Service {
    Write-Host "Monitoring ChatToAPI every $IntervalSeconds seconds. Press Ctrl+C to exit."
    while ($true) {
        $status = Show-Status
        $time = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        $stateText = if ($status.Running -and $status.Healthy) { 'healthy' } elseif ($status.Running) { 'starting/unhealthy' } else { 'stopped' }
        Write-Host "$time [$stateText] pid=$($status.Pid) url=$($status.Url)"
        Start-Sleep -Seconds $IntervalSeconds
    }
}

function Show-InteractiveMenu {
    $done = $false
    while (-not $done) {
        Write-Host ''
        Write-Host '=== ChatToAPI Windows Manager ==='
        Write-Host '1. Start service'
        Write-Host '2. Stop service'
        Write-Host '3. Restart service'
        Write-Host '4. Show status'
        Write-Host '5. Monitor service'
        Write-Host '6. Adopt an existing service on the configured port'
        Write-Host '7. Exit'
        $selection = (Read-Host 'Select an option (1-7)').Trim()
        try {
            switch ($selection) {
                '1' { Start-ChatToApiService; Read-Host 'Press Enter to return to the menu' | Out-Null }
                '2' { Stop-ChatToApiService; Read-Host 'Press Enter to return to the menu' | Out-Null }
                '3' { Stop-ChatToApiService; Start-ChatToApiService; Read-Host 'Press Enter to return to the menu' | Out-Null }
                '4' { Show-Status | Format-List; Read-Host 'Press Enter to return to the menu' | Out-Null }
                '5' { Monitor-Service }
                '6' {
                    $confirmation = (Read-Host 'Type ADOPT to manage the existing service').Trim()
                    if ($confirmation -ceq 'ADOPT') { Adopt-ExistingService } else { Write-Host 'Adoption cancelled.' }
                    Read-Host 'Press Enter to return to the menu' | Out-Null
                }
                '7' { $done = $true }
                default { Write-Host 'Invalid option. Please choose 1-7.' }
            }
        } catch {
            Write-Host "Operation failed: $($_.Exception.Message)"
            Read-Host 'Press Enter to return to the menu' | Out-Null
        }
    }
}

Push-Location $ProjectRoot
try {
    switch ($Command) {
        'menu' { Show-InteractiveMenu }
        'start' { Start-ChatToApiService -ExitAfterStart }
        'stop' { Stop-ChatToApiService }
        'restart' { Stop-ChatToApiService; Start-ChatToApiService -ExitAfterStart }
        'status' { Show-Status | Format-List }
        'monitor' { Monitor-Service }
        'adopt' { Adopt-ExistingService }
    }
} finally {
    Pop-Location
}
