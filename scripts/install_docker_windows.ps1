# install_docker_windows.ps1
# Tentative d'installation non interactive de Docker Desktop / Docker Engine sur Windows.
# Nécessite PowerShell élevé (Run as Administrator).
# Stratégie : essayer winget -> choco -> DockerMsftProvider (Windows Server).

$ErrorActionPreference = 'Stop'
$logDir = Join-Path -Path $PSScriptRoot -ChildPath 'docker-install-logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir (Get-Date -Format 'yyyyMMdd-HHmmss') + '-windows-install.log'
Start-Transcript -Path $logFile -Force

Write-Host "[INSTALLER] Début installation Docker (Windows)"

function Test-Admin {
    $current = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Error "Ce script nécessite des privilèges administrateur. Lancez PowerShell en tant qu'administrateur."; Stop-Transcript; exit 2
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "[INSTALLER] Docker déjà installé : $(docker --version)"; Stop-Transcript; exit 0
}

# 1) Essayer winget
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "[INSTALLER] winget détecté -> installation Docker Desktop"
    winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements -h || Write-Warning "winget failed"
    if (Get-Command docker -ErrorAction SilentlyContinue) { Write-Host "[INSTALLER] Docker installé via winget"; Stop-Transcript; exit 0 }
}

# 2) Essayer Chocolatey
if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host "[INSTALLER] Chocolatey détecté -> installation docker-desktop"
    choco install docker-desktop -y || Write-Warning "choco failed"
    if (Get-Command docker -ErrorAction SilentlyContinue) { Write-Host "[INSTALLER] Docker installé via choco"; Stop-Transcript; exit 0 }
}

# 3) Tentative pour Windows Server (DockerMsftProvider)
try {
    Write-Host "[INSTALLER] Tentative d'installation via DockerMsftProvider (Windows Server)"
    Install-Module -Name DockerMsftProvider -Repository PSGallery -Force -Confirm:$false -Scope AllUsers
    Install-Package -Name docker -ProviderName DockerMsftProvider -Force -Confirm:$false
    Start-Service docker
    if (Get-Command docker -ErrorAction SilentlyContinue) { Write-Host "[INSTALLER] Docker installé via DockerMsftProvider"; Stop-Transcript; exit 0 }
} catch {
    Write-Warning "Installation via DockerMsftProvider échouée: $_"
}

Write-Error "Aucune méthode automatique d'installation disponible sur cette machine. Veuillez installer Docker Desktop manuellement depuis https://www.docker.com/"; Stop-Transcript; exit 3
