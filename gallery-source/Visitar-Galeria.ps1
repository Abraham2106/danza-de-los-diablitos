param([int]$Puerto = 5173)
$ErrorActionPreference = 'Stop'
$galleryWeb = Join-Path $PSScriptRoot 'web'
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Instala Node.js 22 o posterior para iniciar la visita local.' }
Push-Location -LiteralPath $galleryWeb
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
    }
    if (-not (Test-Path -LiteralPath 'dist/index.html')) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la visita web.' }
    }
    Write-Host "Visita local: http://127.0.0.1:$Puerto"
    & npm.cmd run preview -- --host 127.0.0.1 --port $Puerto --strictPort
} finally { Pop-Location }
