# SessionDock Build Script
# Builds the application and copies the installer to the release/ folder
#
# Usage:
#   .\build.ps1              # Build only
#   .\build.ps1 -Release     # Build + copy signed updater artifacts

param([switch]$Release)

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

# Updater artifacts must be signed with the same key trusted by installed copies.
$loadedLocalSigningKey = -not $env:TAURI_SIGNING_PRIVATE_KEY
$loadedLocalSigningPassword = -not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
if ($loadedLocalSigningKey) {
    $signingKeyPath = "src-tauri\.tauri-private-key"
    if (-not (Test-Path $signingKeyPath)) {
        Write-Host "Missing updater signing key: $signingKeyPath" -ForegroundColor Red
        Write-Host "Restore the original private key before building a release." -ForegroundColor Red
        exit 1
    }
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $signingKeyPath -Raw
}
if ($loadedLocalSigningPassword) {
    $signingPasswordPath = "src-tauri\.tauri-key-password"
    if (-not (Test-Path $signingPasswordPath)) {
        Write-Host "Missing updater signing password: $signingPasswordPath" -ForegroundColor Red
        exit 1
    }
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content $signingPasswordPath -Raw
}

# Build
Write-Host "Building SessionDock..." -ForegroundColor Yellow
npx tauri build
$buildExitCode = $LASTEXITCODE
if ($loadedLocalSigningKey) { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue }
if ($loadedLocalSigningPassword) { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }
if ($buildExitCode -ne 0) {
    Write-Host "Build FAILED" -ForegroundColor Red
    exit 1
}

# Copy installer to release/
New-Item -ItemType Directory -Force -Path "release" | Out-Null
$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
    Copy-Item $installer.FullName -Destination "release\$($installer.Name)" -Force
    Write-Host ""
    Write-Host "=== BUILD SUCCESSFUL ===" -ForegroundColor Green
    Write-Host "Installer: release\$($installer.Name)" -ForegroundColor Green
    Write-Host "Size: $([math]::Round($installer.Length/1MB, 2)) MB" -ForegroundColor Green

    # Copy signed updater package and signature if -Release flag.
    if ($Release) {
        $signature = "$($installer.FullName).sig"
        if (-not (Test-Path $signature)) {
            Write-Host "Signed updater artifact not found: $signature" -ForegroundColor Red
            exit 1
        }
        Copy-Item $signature -Destination "release\$($installer.Name).sig" -Force
        Write-Host "Updater signature: release\$($installer.Name).sig" -ForegroundColor Green
    }
} else {
    Write-Host "Warning: Installer not found in bundle output" -ForegroundColor Yellow
}
