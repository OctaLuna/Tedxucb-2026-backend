param(
    [string]$Tag = (Get-Date -Format 'yyyyMMdd-HHmmss'),
    [string]$WebLandingRoot = (Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent),
    [string]$Components = 'backend,tedx,innovation,avatar-service,avatar-editor',
    [string]$BuildCaFile
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$tedxRoot = Join-Path $WebLandingRoot 'TedX-UCB\tedx-ucb-landing'
$innovationRoot = Join-Path $WebLandingRoot 'UcbInnovationWeek\innovation-week-landing'
$avatarRoot = Join-Path $WebLandingRoot 'UcbInnovationWeek\avatar-2d'
$artifacts = Join-Path $PSScriptRoot 'artifacts'
$buildCaPath = $null
$temporaryDockerfiles = $null
if ($BuildCaFile) {
    if (-not (Test-Path -LiteralPath $BuildCaFile -PathType Leaf)) {
        throw "No existe el certificado CA de build: $BuildCaFile"
    }
    $buildCaPath = (Resolve-Path -LiteralPath $BuildCaFile).Path
    $temporaryDockerfiles = Join-Path ([IO.Path]::GetTempPath()) "tedx-build-dockerfiles-$([guid]::NewGuid().ToString('N'))"
}

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

function Get-BuildDockerfile($item) {
    if (-not $buildCaPath) { return $item.Dockerfile }

    $content = Get-Content -Raw -LiteralPath $item.Dockerfile
    $secretMount = ' --mount=type=secret,id=build_ca,target=/tmp/build-ca.pem,required=true '
    $bundleInstall = 'RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*'
    $backendBundleInstall = 'RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*'
    $bundleTrust = "RUN$secretMount cat /tmp/build-ca.pem >> /etc/ssl/certs/ca-certificates.crt"
    $backendBundleIndex = $content.IndexOf($backendBundleInstall, [StringComparison]::Ordinal)
    if ($backendBundleIndex -ge 0) {
        $insertionPoint = $backendBundleIndex + $backendBundleInstall.Length
        $content = $content.Insert($insertionPoint, "`n$bundleTrust")
    } else {
        $workdir = 'WORKDIR /app'
        $workdirIndex = $content.IndexOf($workdir, [StringComparison]::Ordinal)
        if ($workdirIndex -lt 0) { throw "No se encontró WORKDIR /app en el Dockerfile de $($item.Component)." }
        $insertionPoint = $workdirIndex + $workdir.Length
        $bootstrap = "`n$bundleInstall`n$bundleTrust"
        $content = $content.Insert($insertionPoint, $bootstrap)
    }

    if ($item.Component -eq 'tedx') {
        $originalPrepare = 'RUN corepack enable && corepack prepare pnpm@11.1.2 --activate'
        $replacementPrepare = "RUN$secretMount corepack enable && NODE_EXTRA_CA_CERTS=/tmp/build-ca.pem corepack prepare pnpm@11.1.2 --activate"
        $originalInstall = 'RUN pnpm install --frozen-lockfile'
        $replacementInstall = "RUN$secretMount NODE_EXTRA_CA_CERTS=/tmp/build-ca.pem pnpm install --frozen-lockfile"
        $originalBuild = 'RUN pnpm build'
        $replacementBuild = "RUN$secretMount NODE_EXTRA_CA_CERTS=/tmp/build-ca.pem pnpm build"
        if (-not $content.Contains($originalPrepare) -or -not $content.Contains($originalInstall) -or -not $content.Contains($originalBuild)) {
            throw 'No se encontraron los pasos de Corepack/pnpm esperados para inyectar la CA de build.'
        }
        $content = $content.Replace($originalPrepare, $replacementPrepare).Replace($originalInstall, $replacementInstall).Replace($originalBuild, $replacementBuild)
    } else {
        $originalInstall = 'RUN npm ci'
        $replacementInstall = "RUN$secretMount NODE_EXTRA_CA_CERTS=/tmp/build-ca.pem npm ci"
        if (-not $content.Contains($originalInstall)) {
            throw "No se encontró el paso npm ci en el Dockerfile de $($item.Component)."
        }
        $content = $content.Replace($originalInstall, $replacementInstall)
    }

    $temporaryDockerfile = Join-Path $temporaryDockerfiles "$($item.Component).Dockerfile"
    [IO.File]::WriteAllText($temporaryDockerfile, $content, [Text.UTF8Encoding]::new($false))
    return $temporaryDockerfile
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

if ($temporaryDockerfiles) { New-Item -ItemType Directory -Path $temporaryDockerfiles | Out-Null }
try {
    foreach ($item in $selectedImages) {
        $image = "$($item.Name):$Tag"
        Write-Host "Building $image"
        $dockerfile = Get-BuildDockerfile $item
        $buildArgs = @('buildx', 'build', '--platform', 'linux/amd64', '--load', '--file', $dockerfile, '--tag', $image) + $item.Args
        if ($buildCaPath) { $buildArgs += @('--secret', "id=build_ca,src=$buildCaPath") }
        $buildArgs += @($item.Context)
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
}
finally {
    if ($temporaryDockerfiles) {
        $resolvedTemp = [IO.Path]::GetFullPath($temporaryDockerfiles)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (-not $resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Ruta temporal inesperada; no se eliminarán Dockerfiles temporales.'
        }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}

Write-Host "Artefactos y manifiesto creados en $artifacts"
Write-Host "Manifest: $manifestPath"
