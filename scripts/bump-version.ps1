# Bump SessionDock version across all configuration files
# Usage: .\scripts\bump-version.ps1 -Version "0.4.0"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Validate semver format
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "ERROR: Version must be in semver format (e.g. 0.4.0)" -ForegroundColor Red
    exit 1
}

Write-Host "Bumping SessionDock to v$Version" -ForegroundColor Cyan

# Keep package.json and package-lock.json synchronized.
npm version $Version --no-git-tag-version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Use Node.js to safely modify JSON (avoids PowerShell BOM/encoding issues)
node -e "const fs=require('fs');const t=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));t.version='$Version';fs.writeFileSync('src-tauri/tauri.conf.json',JSON.stringify(t,null,2)+'\n');console.log('  tauri.conf.json:',t.version)"

# Cargo.toml (simple text replace)
$cargoPath = "src-tauri\Cargo.toml"
$cargo = Get-Content $cargoPath -Raw
$cargo = $cargo -replace 'version = "\d+\.\d+\.\d+"', "version = `"$Version`""
[System.IO.File]::WriteAllText("$PWD\$cargoPath", $cargo)
Write-Host "  Cargo.toml: $Version"

# Update only the SessionDock package entry in Cargo.lock.
$cargoLockPath = "src-tauri\Cargo.lock"
$cargoLock = Get-Content $cargoLockPath -Raw
$cargoLock = $cargoLock -replace '(?s)(name = "sessiondock"\r?\nversion = ")\d+\.\d+\.\d+("\r?\n)', "`${1}$Version`${2}"
[System.IO.File]::WriteAllText("$PWD\$cargoLockPath", $cargoLock)
Write-Host "  Cargo.lock: $Version"

# Keep documentation examples on the current release filename using explicit UTF-8 I/O.
node -e "const fs=require('fs');const p='README.md';let s=fs.readFileSync(p,'utf8');s=s.replace(/version-\d+\.\d+\.\d+-blue/g,'version-$Version-blue').replace(/SessionDock_\d+\.\d+\.\d+_x64-setup\.exe/g,'SessionDock_${Version}_x64-setup.exe');fs.writeFileSync(p,s,'utf8')"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  README.md: $Version"

# Validate
Write-Host ""
& "$PSScriptRoot\validate-version.ps1"
