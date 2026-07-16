# Validate that all version declarations in SessionDock are synchronized
# Exit code 0 = all match, 1 = mismatch found

$errors = @()

# Read versions from each source
$tauriConf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$tauriVersion = $tauriConf.version

$pkgJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$pkgVersion = $pkgJson.version

$cargoContent = Get-Content "src-tauri\Cargo.toml" -Raw
if ($cargoContent -match 'version = "(\d+\.\d+\.\d+)"') {
    $cargoVersion = $Matches[1]
} else {
    $cargoVersion = "NOT_FOUND"
}

Write-Host "Version check:" -ForegroundColor Cyan
Write-Host "  tauri.conf.json: $tauriVersion"
Write-Host "  package.json:    $pkgVersion"
Write-Host "  Cargo.toml:      $cargoVersion"

# Compare
if ($tauriVersion -ne $pkgVersion) {
    $errors += "tauri.conf.json ($tauriVersion) != package.json ($pkgVersion)"
}
if ($tauriVersion -ne $cargoVersion) {
    $errors += "tauri.conf.json ($tauriVersion) != Cargo.toml ($cargoVersion)"
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "VERSION MISMATCH:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Run: .\scripts\bump-version.ps1 -Version $tauriVersion" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host ""
    Write-Host "All versions match: $tauriVersion" -ForegroundColor Green
    exit 0
}
