# SessionDock Build Script
# Builds the application and copies the installer to the release/ folder

Write-Host "=== SessionDock Build ===" -ForegroundColor Cyan
Write-Host ""

# Set proxy if on Intel network
if (-not $env:HTTPS_PROXY) {
    $env:HTTPS_PROXY = "http://proxy-iil.intel.com:912"
    $env:HTTP_PROXY = "http://proxy-iil.intel.com:912"
}

# Ensure Rust is in PATH
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
}

# Build
Write-Host "Building SessionDock..." -ForegroundColor Yellow
npx tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build FAILED" -ForegroundColor Red
    exit 1
}

# Copy installer to release/
New-Item -ItemType Directory -Force -Path "release" | Out-Null
$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1
if ($installer) {
    Copy-Item $installer.FullName -Destination "release\$($installer.Name)" -Force
    Write-Host ""
    Write-Host "=== BUILD SUCCESSFUL ===" -ForegroundColor Green
    Write-Host "Installer: release\$($installer.Name)" -ForegroundColor Green
    Write-Host "Size: $([math]::Round($installer.Length/1MB, 2)) MB" -ForegroundColor Green
} else {
    Write-Host "Warning: Installer not found in bundle output" -ForegroundColor Yellow
}
