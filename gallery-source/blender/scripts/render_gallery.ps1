param([switch]$Preview, [string]$Camera = '', [switch]$Resume, [int]$Samples = 512, [double]$Threshold = .01)
$ErrorActionPreference = 'Stop'
$galleryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$blenderExe = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
if (-not (Test-Path -LiteralPath $blenderExe)) {
    $blenderExe = (Get-Command blender -ErrorAction Stop).Source
}
$scenePath = Join-Path $galleryRoot 'blender\gallery.blend'
$scriptPath = Join-Path $PSScriptRoot 'render_gallery.py'
$renderArgs = @('-b', $scenePath, '--python-exit-code', '1', '-P', $scriptPath, '--')
if ($Preview) { $renderArgs += '--preview' }
if ($Camera) { $renderArgs += @('--camera', $Camera) }
if ($Resume) { $renderArgs += '--resume' }
if ($PSBoundParameters.ContainsKey('Samples')) { $renderArgs += @('--samples', $Samples.ToString()) }
if ($PSBoundParameters.ContainsKey('Threshold')) { $renderArgs += @('--threshold', $Threshold.ToString([System.Globalization.CultureInfo]::InvariantCulture)) }
& $blenderExe @renderArgs
if ($LASTEXITCODE -ne 0) { throw "Blender render exited with code $LASTEXITCODE" }
