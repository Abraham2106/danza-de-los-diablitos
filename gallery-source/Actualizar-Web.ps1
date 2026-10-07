param(
    [switch]$SinHornear,
    [ValidateSet('CPU','GPU')][string]$Dispositivo = 'GPU',
    [string]$Blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Blender)) { throw 'Indica la ruta de blender.exe con el parametro -Blender.' }
$galleryBlend = Join-Path $PSScriptRoot 'blender/gallery.blend'
$galleryExport = Join-Path $PSScriptRoot 'blender/scripts/export_gallery.py'
$galleryArgs = @('-b', $galleryBlend, '--python-exit-code', '1', '-P', $galleryExport, '--', '--device', $Dispositivo)
if ($SinHornear) { $galleryArgs += '--no-bake' }
& $Blender @galleryArgs
if ($LASTEXITCODE -ne 0) { throw 'La exportacion ha fallado. Consulta los errores antes de publicar.' }
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'web')
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'La compilacion web ha fallado.' }
} finally { Pop-Location }
