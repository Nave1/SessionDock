# Generate update manifest (latest.json) for a new release
# Usage: .\scripts\generate-update-manifest.ps1 -Version "0.3.0" -Notes "Bug fixes"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [string]$Notes = "See changelog for details.",

    [string]$GithubUser = "user",
    [string]$GithubRepo = "sessiondock"
)

$date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$baseUrl = "https://github.com/$GithubUser/$GithubRepo/releases/download/v$Version"

$manifest = @{
    version = $Version
    notes = $Notes
    pub_date = $date
    platforms = @{
        "windows-x86_64" = @{
            url = "$baseUrl/SessionDock_${Version}_x64-setup.nsis.zip"
            signature = ""
        }
    }
} | ConvertTo-Json -Depth 4

$outputPath = "release\latest.json"
$manifest | Set-Content -Path $outputPath -Encoding UTF8

Write-Host "Generated $outputPath for v$Version" -ForegroundColor Green
Write-Host ""
Write-Host "To publish this update:" -ForegroundColor Yellow
Write-Host "1. Create a GitHub release tagged 'v$Version'"
Write-Host "2. Upload: release\SessionDock_${Version}_x64-setup.exe"
Write-Host "3. Upload: release\latest.json"
Write-Host ""
Write-Host "Users with SessionDock installed will see the update notification automatically."
