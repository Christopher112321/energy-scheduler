<#
.SYNOPSIS
    Automated deployment script for Energy-Aware Weekly Scheduler to Vercel.

.DESCRIPTION
    Performs pre-flight checks (Node.js >= 18, npm >= 9), runs backend test suite
    (npm test), executes frontend production build (npm run build), and deploys the
    project to Vercel via Vercel CLI (npx --yes vercel).

.PARAMETER Prod
    Deploys directly to the Vercel Production environment (Alias: -Production).
    If omitted, a Preview deployment is created.

.EXAMPLE
    .\deploy.ps1
    Executes pre-flight tests and builds, then creates a Vercel Preview deployment.

.EXAMPLE
    .\deploy.ps1 -Prod
    Executes pre-flight tests and builds, then deploys directly to Production on Vercel.

.EXAMPLE
    .\deploy.ps1 -Production
    Equivalent to .\deploy.ps1 -Prod.
#>

[CmdletBinding()]
param(
    [Alias("Production")]
    [switch]$Prod
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host ">> $Message" -ForegroundColor Cyan
    Write-Host "==================================================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-Failure {
    param([string]$Message)
    Write-Host "[X] GAGAL: $Message" -ForegroundColor Red
}

# Ensure script runs from project root directory
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# Resolve command paths for npm and npx to prioritize .cmd on Windows
# Prevents PowerShell call operator '&' from executing npm.ps1 / npx.ps1 which causes 'Unknown command: pm'
$npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }
$npxCmd = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { 'npx.cmd' } else { 'npx' }

if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    function npm { & npm.cmd @args }
}
if (Get-Command npx.cmd -ErrorAction SilentlyContinue) {
    function npx { & npx.cmd @args }
}

$targetEnv = if ($Prod) { "PRODUCTION" } else { "PREVIEW" }

Write-Host "------------------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " Energy-Aware Weekly Scheduler - Vercel Deployment Automation" -ForegroundColor White
Write-Host " Target Lingkungan : $targetEnv" -ForegroundColor Yellow
Write-Host " Root Proyek       : $ProjectRoot" -ForegroundColor DarkGray
Write-Host "------------------------------------------------------------------" -ForegroundColor DarkCyan

# -----------------------------------------------------------------------------
# STEP 1: Pre-Flight Environment Checks (Node.js & npm)
# -----------------------------------------------------------------------------
Write-Step "Langkah 1/3: Pemeriksaan Lingkungan & Versi (Pre-flight Checks)"

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Failure "Node.js tidak ditemukan di PATH sistem. Silakan instal Node.js versi 18 atau lebih baru (https://nodejs.org)."
    exit 1
}

$rawNodeVersion = (node -v 2>$null).Trim()
Write-Host "Terdeteksi Node.js: $rawNodeVersion" -ForegroundColor Gray

if ($rawNodeVersion -match '^v?(\d+)') {
    $nodeMajor = [int]$matches[1]
    if ($nodeMajor -lt 18) {
        Write-Failure "Versi Node.js $rawNodeVersion tidak didukung. Diperlukan Node.js versi >= 18.0.0."
        exit 1
    }
} else {
    Write-WarningMsg "Format versi Node.js tidak lazim ($rawNodeVersion). Melanjutkan dengan asumsi kompatibel."
}

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Failure "npm tidak ditemukan di PATH sistem. Pastikan npm terpasang bersama Node.js."
    exit 1
}

$rawNpmVersion = (npm -v 2>$null).Trim()
Write-Host "Terdeteksi npm    : $rawNpmVersion" -ForegroundColor Gray

if ($rawNpmVersion -match '^(\d+)') {
    $npmMajor = [int]$matches[1]
    if ($npmMajor -lt 9) {
        Write-Failure "Versi npm $rawNpmVersion tidak didukung. Diperlukan npm versi >= 9.0.0 (npm workspaces)."
        exit 1
    }
} else {
    Write-WarningMsg "Format versi npm tidak lazim ($rawNpmVersion). Melanjutkan dengan asumsi kompatibel."
}

Write-Success "Pemeriksaan versi Node.js ($rawNodeVersion) dan npm ($rawNpmVersion) lolos."

# -----------------------------------------------------------------------------
# STEP 2: Pre-Deployment Verification (npm test & npm run build)
# -----------------------------------------------------------------------------
Write-Step "Langkah 2/3: Verifikasi Integritas Proyek (Pengujian & Build)"

Write-Host "Menjalankan suite pengujian backend (npm test)..." -ForegroundColor White
& npm test
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Pengujian backend gagal dengan exit code $LASTEXITCODE. Deployment dibatalkan demi keamanan."
    exit $LASTEXITCODE
}
Write-Success "Seluruh pengujian backend berhasil dilewati."

Write-Host "Membangun frontend untuk produksi (npm run build)..." -ForegroundColor White
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Build bundle frontend gagal dengan exit code $LASTEXITCODE. Deployment dibatalkan."
    exit $LASTEXITCODE
}

if (-not (Test-Path "$ProjectRoot\frontend\dist\index.html")) {
    Write-Failure "Direktori 'frontend/dist/index.html' tidak ditemukan setelah build selesai."
    exit 1
}
Write-Success "Build bundle frontend berhasil diverifikasi di 'frontend/dist'."

# -----------------------------------------------------------------------------
# STEP 3: Vercel CLI Deployment
# -----------------------------------------------------------------------------
Write-Step "Langkah 3/3: Melakukan Deployment ke Vercel ($targetEnv)"

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Failure "npx tidak ditemukan di PATH sistem. Diperlukan untuk mengeksekusi Vercel CLI."
    exit 1
}

$vercelCmdArgs = @("--yes", "vercel")
if ($Prod) {
    $vercelCmdArgs += "--prod"
    Write-Host "Menjalankan deployment PRODUKSI: npx --yes vercel --prod" -ForegroundColor Yellow
} else {
    Write-Host "Menjalankan deployment PREVIEW: npx --yes vercel" -ForegroundColor Yellow
}

& npx $vercelCmdArgs
$deployExitCode = $LASTEXITCODE

if ($deployExitCode -ne 0) {
    Write-Failure "Proses deployment Vercel keluar dengan kode kesalahan $deployExitCode."
    Write-Host ""
    Write-WarningMsg "Jika Anda belum terautentikasi ke akun Vercel, jalankan perintah berikut sekali untuk login:"
    Write-Host "    npx vercel login" -ForegroundColor White
    Write-Host ""
    Write-WarningMsg "Jika proyek belum terhubung (linked), jalankan perintah berikut untuk mengaitkan proyek:"
    Write-Host "    npx vercel link" -ForegroundColor White
    exit $deployExitCode
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " [SELESAI] Deployment $targetEnv berhasil dipublikasikan ke Vercel!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
exit 0
