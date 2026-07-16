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

# Use Node.js to safely modify JSON (avoids PowerShell BOM/encoding issues)
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='$Version';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');console.log('  package.json:',p.version)"
node -e "const fs=require('fs');const t=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));t.version='$Version';fs.writeFileSync('src-tauri/tauri.conf.json',JSON.stringify(t,null,2)+'\n');console.log('  tauri.conf.json:',t.version)"

# Cargo.toml (simple text replace)
$cargoPath = "src-tauri\Cargo.toml"
$cargo = Get-Content $cargoPath -Raw
$cargo = $cargo -replace 'version = "\d+\.\d+\.\d+"', "version = `"$Version`""
[System.IO.File]::WriteAllText("$PWD\$cargoPath", $cargo)
Write-Host "  Cargo.toml: $Version"

# Validate
Write-Host ""
& "$PSScriptRoot\validate-version.ps1"
