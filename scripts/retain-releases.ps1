param(
  [Parameter(Mandatory = $true)]
  [string]$Repository,

  [ValidateRange(2, 10)]
  [int]$Keep = 2,

  [string]$ReleaseDirectory = (Join-Path $PSScriptRoot "..\release")
)

$ErrorActionPreference = "Stop"

$releaseJson = gh release list --repo $Repository --limit 100 --json tagName,isDraft
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list GitHub releases for $Repository."
}

$parsedReleases = ConvertFrom-Json -InputObject ($releaseJson -join "`n")
$releases = $parsedReleases |
  Where-Object { (-not $_.isDraft) -and $_.tagName -match '^v\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.tagName.Substring(1) } -Descending

if ($releases.Count -lt $Keep) {
  throw "Expected at least $Keep published semantic-version releases, found $($releases.Count)."
}

$retained = @($releases | Select-Object -First $Keep)
$obsolete = @($releases | Select-Object -Skip $Keep)
$downloadDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "sessiondock-release-retention"

Remove-Item $downloadDirectory -Recurse -Force -ErrorAction SilentlyContinue
New-Item $downloadDirectory -ItemType Directory | Out-Null

try {
  foreach ($release in $retained) {
    gh release download $release.tagName --repo $Repository --dir $downloadDirectory --pattern 'SessionDock_*_x64-setup.exe*'
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to download backup assets for $($release.tagName)."
    }
  }

  $expectedAssetCount = $Keep * 2
  $assets = @(Get-ChildItem $downloadDirectory -File)
  if ($assets.Count -ne $expectedAssetCount) {
    throw "Expected $expectedAssetCount retained installer assets, found $($assets.Count)."
  }

  New-Item $ReleaseDirectory -ItemType Directory -Force | Out-Null
  Remove-Item (Join-Path $ReleaseDirectory '*') -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $downloadDirectory '*') $ReleaseDirectory

  foreach ($release in $obsolete) {
    gh release delete $release.tagName --repo $Repository --yes
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to delete obsolete GitHub release $($release.tagName)."
    }
  }

  Write-Host "Retained releases: $($retained.tagName -join ', ')"
}
finally {
  Remove-Item $downloadDirectory -Recurse -Force -ErrorAction SilentlyContinue
}