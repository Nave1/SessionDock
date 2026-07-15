# Local Update Server for SessionDock
# Serves the release/ folder on http://localhost:8080
# Run this, then open SessionDock v0.1.0 — it will see the v0.2.0 update
#
# Usage: .\scripts\serve-updates.ps1

$port = 8080
$path = Join-Path $PSScriptRoot "..\release"
$path = (Resolve-Path $path).Path

Write-Host "=== SessionDock Update Server ===" -ForegroundColor Cyan
Write-Host "Serving: $path" -ForegroundColor Gray
Write-Host "URL: http://localhost:$port/" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $fileName = $request.Url.AbsolutePath.TrimStart("/")
        if (-not $fileName) { $fileName = "latest.json" }
        $filePath = Join-Path $path $fileName

        Write-Host "$(Get-Date -Format 'HH:mm:ss') $($request.HttpMethod) /$fileName" -NoNewline

        if (Test-Path $filePath) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length

            # Set content type
            if ($fileName -match "\.json$") {
                $response.ContentType = "application/json"
            } elseif ($fileName -match "\.exe$") {
                $response.ContentType = "application/octet-stream"
            }

            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
            Write-Host " -> 200 ($([math]::Round($bytes.Length/1KB)) KB)" -ForegroundColor Green
        } else {
            $response.StatusCode = 404
            Write-Host " -> 404 Not Found" -ForegroundColor Red
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host "Server stopped."
}
