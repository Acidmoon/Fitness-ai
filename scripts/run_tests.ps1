param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runId = "{0}-{1}" -f $PID, ([Guid]::NewGuid().ToString("N"))
$baseTemp = Join-Path $projectRoot ".cowork-temp\pytest-$runId"
$cacheDir = Join-Path $projectRoot ".cowork-temp\pytest-cache-$runId"

New-Item -ItemType Directory -Force -Path $baseTemp, $cacheDir | Out-Null

if (-not $PytestArgs) {
    $PytestArgs = @()
}

$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$env:TEMP = $baseTemp
$env:TMP = $baseTemp

try {
    python -m pytest @PytestArgs --basetemp="$baseTemp" -o "cache_dir=$cacheDir"
    $exitCode = $LASTEXITCODE
}
finally {
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
}

exit $exitCode
