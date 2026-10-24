param(
    [string]$Tag = (Get-Date -Format 'yyyyMMdd-HHmmss'),
    [string]$WebLandingRoot = (Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent),
    [string]$Components = 'backend,tedx,innovation,avatar-service,avatar-editor'
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$tedxRoot = Join-Path $WebLandingRoot 'TedX-UCB\tedx-ucb-landing'
$innovationRoot = Join-Path $WebLandingRoot 'UcbInnovationWeek\innovation-week-landing'
$avatarRoot = Join-Path $WebLandingRoot 'UcbInnovationWeek\avatar-2d'
$artifacts = Join-Path $PSScriptRoot 'artifacts'

foreach ($path in @($backendRoot, $tedxRoot, $innovationRoot, $avatarRoot)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "No existe el repositorio requerido: $path" }
}

function Read-DotEnv([string]$path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $values
}

function Get-SourceInfo([string]$path) {
    $revision = (& git -C $path rev-parse --short HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { $revision = 'no-git' }
    $dirty = (& git -C $path status --porcelain 2>$null)
    return "$revision$(if ($dirty) { '-dirty' })"
}

$innovationEnv = Read-DotEnv (Join-Path $innovationRoot 'frontend\.env.local')
$tedxEnv = Read-DotEnv (Join-Path $tedxRoot 'frontend\.env.local')
$innovationGoogle = $innovationEnv['VITE_GOOGLE_CLIENT_ID']
$tedxGoogle = $tedxEnv['NEXT_PUBLIC_GOOGLE_CLIENT_ID']
if (-not $innovationGoogle -or -not $tedxGoogle -or $innovationGoogle -ne $tedxGoogle) {
    throw 'Los dos frontends deben tener el mismo VITE/NEXT_PUBLIC_GOOGLE_CLIENT_ID antes de empaquetar.'
}

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
$images = @(
    @{ Component = 'backend'; Name = 'tedx-platform-backend'; Context = $backendRoot; Dockerfile = (Join-Path $backendRoot 'Dockerfile'); Args = @() },
    @{ Component = 'tedx'; Name = 'tedx-platform-tedx'; Context = $tedxRoot; Dockerfile = (Join-Path $tedxRoot 'frontend\Dockerfile'); Args = @('--build-arg', 'NEXT_PUBLIC_API_BASE_URL=/api/v1', '--build-arg', "NEXT_PUBLIC_GOOGLE_CLIENT_ID=$tedxGoogle", '--build-arg', 'NEXT_PUBLIC_AVATAR_2D_EDITOR_URL=') },
    @{ Component = 'innovation'; Name = 'tedx-platform-innovation'; Context = $innovationRoot; Dockerfile = (Join-Path $innovationRoot 'deploy\Dockerfile'); Args = @('--build-arg', 'VITE_API_BASE_URL=/api/v1', '--build-arg', "VITE_GOOGLE_CLIENT_ID=$innovationGoogle", '--build-arg', 'VITE_AVATAR_2D_EDITOR_URL=/avatar/') },
    @{ Component = 'avatar-service'; Name = 'tedx-platform-avatar-service'; Context = $avatarRoot; Dockerfile = (Join-Path $avatarRoot 'Dockerfile.avatar-service'); Args = @() },
    @{ Component = 'avatar-editor'; Name = 'tedx-platform-avatar-editor'; Context = $avatarRoot; Dockerfile = (Join-Path $avatarRoot 'Dockerfile.avatar-editor'); Args = @('--build-arg', 'VITE_HOST_ORIGINS=https://semana-fcef.sis-ucb.site', '--build-arg', 'VITE_BASE=/avatar/') }
)

$manifest = [System.Collections.Generic.List[string]]::new()
$manifestPath = Join-Path $artifacts "manifest-$Tag.txt"
if (Test-Path -LiteralPath $manifestPath) { $manifest.AddRange([string[]](Get-Content -LiteralPath $manifestPath)) }
else {
    $manifest.Add("tag=$Tag")
    $manifest.Add("backend=$(Get-SourceInfo $backendRoot)")
    $manifest.Add("tedx=$(Get-SourceInfo $tedxRoot)")
    $manifest.Add("innovation=$(Get-SourceInfo $innovationRoot)")
    $manifest.Add("avatar=$(Get-SourceInfo $avatarRoot)")
}

$selectedComponents = @($Components -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$selectedImages = @($images | Where-Object { $_.Component -in $selectedComponents })
if (-not $selectedImages.Count) { throw "No hay componentes reconocidos: $Components" }

foreach ($item in $selectedImages) {
    $image = "$($item.Name):$Tag"
    Write-Host "Building $image"
    $buildArgs = @('buildx', 'build', '--platform', 'linux/amd64', '--load', '--file', $item.Dockerfile, '--tag', $image) + $item.Args + @($item.Context)
    & docker @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "Falló la construcción de $image" }

    $archive = Join-Path $artifacts "$($item.Name)-$Tag.tar"
    & docker save --output $archive $image
    if ($LASTEXITCODE -ne 0) { throw "Falló la exportación de $image" }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
    $manifest = [System.Collections.Generic.List[string]]::new([string[]](@($manifest | Where-Object { $_ -notmatch "^$([regex]::Escape($image)) sha256=" })))
    $manifest.Add("$image sha256=$hash bytes=$((Get-Item -LiteralPath $archive).Length)")
    $manifest | Set-Content -LiteralPath $manifestPath -Encoding ascii
}

Write-Host "Artefactos y manifiesto creados en $artifacts"
Write-Host "Manifest: $manifestPath"
