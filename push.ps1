<#
.SYNOPSIS
    Git helper script to initialize, stage, commit, and push the project to GitHub.

.DESCRIPTION
    Automates routine Git workflow:
    - Initializes Git repository if not already initialized and sets primary branch to 'main'.
    - Stages all modified and new files (respecting .gitignore).
    - Prompts for commit message or uses specified/default message.
    - Checks for remote 'origin'; if absent, guides the user on linking and pushing to GitHub.

.PARAMETER Message
    Commit message. If omitted, prompts interactively or falls back to a descriptive default.

.PARAMETER RemoteUrl
    Optional Git remote URL (e.g., https://github.com/username/repo.git) to set as origin.

.PARAMETER Branch
    Branch name to target. Defaults to 'main'.

.EXAMPLE
    .\push.ps1
    Stages files, prompts for commit message, and pushes to origin main.

.EXAMPLE
    .\push.ps1 "feat: configure Vercel deployment and automation scripts"
    Stages files, commits with the specified message, and pushes.

.EXAMPLE
    .\push.ps1 -RemoteUrl "https://github.com/username/my-scheduler.git"
    Configures remote origin and pushes to main.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Message,
    [string]$RemoteUrl,
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host ">> $Text" -ForegroundColor Cyan
    Write-Host "==================================================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "[i] $Text" -ForegroundColor Gray
}

function Write-WarningMsg {
    param([string]$Text)
    Write-Host "[!] $Text" -ForegroundColor Yellow
}

function Write-Failure {
    param([string]$Text)
    Write-Host "[X] GAGAL: $Text" -ForegroundColor Red
}

# Ensure execution in project root
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "------------------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " Energy-Aware Weekly Scheduler - Git Automation Helper" -ForegroundColor White
Write-Host " Root Direktori: $ProjectRoot" -ForegroundColor DarkGray
Write-Host " Target Branch : $Branch" -ForegroundColor DarkGray
Write-Host "------------------------------------------------------------------" -ForegroundColor DarkCyan

# -----------------------------------------------------------------------------
# STEP 1: Check Git Installation & Repository Initialization
# -----------------------------------------------------------------------------
Write-Step "Langkah 1/4: Pemeriksaan Status Repositori Git"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Failure "Git CLI tidak ditemukan di PATH sistem. Silakan instal Git (https://git-scm.com)."
    exit 1
}

$isRepo = $false
try {
    $insideWorkTree = (git rev-parse --is-inside-work-tree 2>$null)
    if ($insideWorkTree -eq "true") {
        $isRepo = $true
    }
} catch {
    $isRepo = $false
}

if (-not $isRepo) {
    Write-Host "Repositori Git belum diinisialisasi. Menjalankan 'git init'..." -ForegroundColor Yellow
    & git init
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Gagal menginisialisasi repositori Git."
        exit $LASTEXITCODE
    }
    & git branch -M $Branch
    Write-Success "Repositori Git berhasil diinisialisasi dengan default branch '$Branch'."
} else {
    Write-Success "Repositori Git aktif terdeteksi."
}

# Ensure branch naming
$currentBranch = (git branch --show-current 2>$null)
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    & git branch -M $Branch
    $currentBranch = $Branch
} else {
    $currentBranch = $currentBranch.Trim()
}
Write-Info "Branch aktif saat ini: $currentBranch"

# -----------------------------------------------------------------------------
# STEP 2: Stage Files (Respecting .gitignore)
# -----------------------------------------------------------------------------
Write-Step "Langkah 2/4: Melakukan Staging Perubahan (git add .)"

Write-Info "Menambahkan semua perubahan file ke staging area..."
& git add .
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Perintah 'git add .' gagal."
    exit $LASTEXITCODE
}
Write-Success "File berhasil di-stage (aturan file .gitignore diterapkan)."

# -----------------------------------------------------------------------------
# STEP 3: Commit Changes
# -----------------------------------------------------------------------------
Write-Step "Langkah 3/4: Membuat Git Commit"

$statusPorcelain = (git status --porcelain 2>$null)

if (-not [string]::IsNullOrWhiteSpace($statusPorcelain)) {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $isInteractive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
        if ($isInteractive) {
            Write-Host ""
            $inputMsg = Read-Host "Masukkan pesan commit (tekan Enter untuk menggunakan default)"
            if (-not [string]::IsNullOrWhiteSpace($inputMsg)) {
                $Message = $inputMsg.Trim()
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "feat: update Energy-Aware Weekly Scheduler and Vercel configuration"
    }

    Write-Host "Membuat commit dengan pesan: '$Message'..." -ForegroundColor White
    & git commit -m "$Message"
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Gagal membuat commit."
        exit $LASTEXITCODE
    }
    Write-Success "Commit berhasil dibuat."
} else {
    Write-Info "Tidak ada perubahan file baru untuk di-commit (working tree bersih)."
}

# -----------------------------------------------------------------------------
# STEP 4: Check Remote & Push
# -----------------------------------------------------------------------------
Write-Step "Langkah 4/4: Sinkronisasi ke Remote GitHub"

$remotes = @(& git remote 2>$null)
$originUrl = $null
if ($remotes -contains "origin") {
    $originUrl = (& git remote get-url origin 2>$null)
    if (-not [string]::IsNullOrWhiteSpace($originUrl)) {
        $originUrl = $originUrl.Trim()
    }
}

# If remote origin not configured, check parameters or interactive input
if ([string]::IsNullOrWhiteSpace($originUrl)) {
    if (-not [string]::IsNullOrWhiteSpace($RemoteUrl)) {
        Write-Host "Menambahkan remote origin: $RemoteUrl" -ForegroundColor Cyan
        & git remote add origin $RemoteUrl.Trim()
        $originUrl = $RemoteUrl.Trim()
    } else {
        $isInteractive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
        if ($isInteractive) {
            Write-Host ""
            Write-WarningMsg "Remote 'origin' belum dikonfigurasi."
            $inputRemote = Read-Host "Masukkan URL repository GitHub (contoh: https://github.com/username/repo.git) atau tekan Enter untuk lewati"
            if (-not [string]::IsNullOrWhiteSpace($inputRemote)) {
                & git remote add origin $inputRemote.Trim()
                $originUrl = $inputRemote.Trim()
                Write-Success "Remote origin berhasil ditambahkan: $originUrl"
            }
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($originUrl)) {
    Write-Host "Mendorong perubahan ke remote origin ($originUrl) pada branch '$currentBranch'..." -ForegroundColor White
    & git push -u origin $currentBranch
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "==================================================================" -ForegroundColor Green
        Write-Host " [SELESAI] Kode berhasil didorong ke GitHub ($currentBranch)!" -ForegroundColor Green
        Write-Host "==================================================================" -ForegroundColor Green
    } else {
        Write-Failure "Gagal melakukan push ke remote origin ($LASTEXITCODE)."
        Write-WarningMsg "Pastikan Anda memiliki izin tulis pada repository dan kredensial Git telah terkonfigurasi."
        exit $LASTEXITCODE
    }
} else {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Yellow
    Write-Host " [PANDUAN] Remote 'origin' Belum Dikonfigurasi" -ForegroundColor Yellow
    Write-Host "==================================================================" -ForegroundColor Yellow
    Write-Host "Repositori lokal telah siap dan perubahan telah di-commit secara aman." -ForegroundColor White
    Write-Host "Untuk menghubungkan dan mendorong kode ini ke GitHub:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. Buat repository baru di GitHub: https://github.com/new" -ForegroundColor Cyan
    Write-Host "  2. Jalankan dua perintah berikut di terminal Anda:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "     git remote add origin https://github.com/<username>/<nama-repo>.git" -ForegroundColor White
    Write-Host "     git push -u origin $currentBranch" -ForegroundColor White
    Write-Host ""
    Write-Host "Atau jalankan ulang script ini dengan parameter -RemoteUrl:" -ForegroundColor DarkGray
    Write-Host "     .\push.ps1 -RemoteUrl `"https://github.com/<username>/<nama-repo>.git`"" -ForegroundColor DarkGray
    Write-Host "==================================================================" -ForegroundColor Yellow
}

exit 0
