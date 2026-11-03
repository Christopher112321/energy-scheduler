#!/usr/bin/env bash
# =============================================================================
# Energy-Aware Weekly Scheduler - Git Automation Helper (Bash)
# =============================================================================
# Description:
#   Automates routine Git workflow:
#   - Initializes Git repository if missing, setting primary branch to 'main'.
#   - Stages modified and new files (respecting .gitignore).
#   - Commits changes with custom or default message.
#   - Inspects remote 'origin'; pushes if present, or outputs guidance if absent.
#
# Usage:
#   ./push.sh                                   # Interactive / default commit
#   ./push.sh "feat: implement scheduling UI"   # Custom commit message
#   ./push.sh -r https://github.com/user/repo   # Set remote and push
#   ./push.sh --help                            # Show help message
# =============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMMIT_MSG=""
REMOTE_URL=""
BRANCH="main"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--remote)
      REMOTE_URL="$2"
      shift 2
      ;;
    -b|--branch)
      BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      echo "Penggunaan: ./push.sh [PESAN_COMMIT] [-r URL_REMOTE] [-b BRANCH]"
      echo ""
      echo "Opsi:"
      echo "  -r, --remote URL   Tentukan URL remote origin jika belum ada"
      echo "  -b, --branch NAMA  Tentukan nama branch tujuan (default: main)"
      echo "  -h, --help         Tampilkan bantuan ini"
      echo ""
      echo "Contoh:"
      echo "  ./push.sh \"feat: deploy ready\""
      echo "  ./push.sh -r https://github.com/username/my-scheduler.git"
      exit 0
      ;;
    *)
      if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="$1"
      else
        COMMIT_MSG="$COMMIT_MSG $1"
      fi
      shift
      ;;
  esac
done

echo -e "${CYAN}------------------------------------------------------------------${NC}"
echo -e "${CYAN} Energy-Aware Weekly Scheduler - Git Automation Helper${NC}"
echo -e " Root Direktori: ${GRAY}${SCRIPT_DIR}${NC}"
echo -e " Target Branch : ${GRAY}${BRANCH}${NC}"
echo -e "${CYAN}------------------------------------------------------------------${NC}"

# -----------------------------------------------------------------------------
# STEP 1: Check Git Installation & Repository Initialization
# -----------------------------------------------------------------------------
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 1/4: Pemeriksaan Status Repositori Git${NC}"
echo -e "${CYAN}==================================================================${NC}"

if ! command -v git >/dev/null 2>&1; then
  echo -e "${RED}[X] GAGAL: Git CLI tidak ditemukan di PATH sistem.${NC}"
  echo "Silakan pasang Git (https://git-scm.com)."
  exit 1
fi

IS_GIT_REPO=false
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  IS_GIT_REPO=true
fi

if [ "$IS_GIT_REPO" = false ]; then
  echo -e "${YELLOW}[*] Repositori Git belum diinisialisasi. Menjalankan 'git init'...${NC}"
  git init
  git branch -M "$BRANCH"
  echo -e "${GREEN}[OK] Repositori Git berhasil diinisialisasi pada branch '${BRANCH}'.${NC}"
else
  echo -e "${GREEN}[OK] Repositori Git aktif terdeteksi.${NC}"
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || true)
if [ -z "$CURRENT_BRANCH" ]; then
  git branch -M "$BRANCH"
  CURRENT_BRANCH="$BRANCH"
fi
echo -e "Branch aktif saat ini: ${CURRENT_BRANCH}"

# -----------------------------------------------------------------------------
# STEP 2: Stage Files (Respecting .gitignore)
# -----------------------------------------------------------------------------
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 2/4: Melakukan Staging Perubahan (git add .)${NC}"
echo -e "${CYAN}==================================================================${NC}"

echo "Menambahkan semua perubahan file ke staging area..."
git add .
echo -e "${GREEN}[OK] File berhasil di-stage (aturan file .gitignore diterapkan).${NC}"

# -----------------------------------------------------------------------------
# STEP 3: Commit Changes
# -----------------------------------------------------------------------------
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 3/4: Membuat Git Commit${NC}"
echo -e "${CYAN}==================================================================${NC}"

STATUS_PORCELAIN=$(git status --porcelain 2>/dev/null || true)

if [ -n "$STATUS_PORCELAIN" ]; then
  if [ -z "$COMMIT_MSG" ]; then
    if [ -t 0 ]; then
      echo ""
      read -r -p "Masukkan pesan commit (tekan Enter untuk default): " USER_INPUT
      if [ -n "$USER_INPUT" ]; then
        COMMIT_MSG="$USER_INPUT"
      fi
    fi
  fi

  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="feat: update Energy-Aware Weekly Scheduler and Vercel configuration"
  fi

  echo "Membuat commit: '${COMMIT_MSG}'..."
  git commit -m "$COMMIT_MSG"
  echo -e "${GREEN}[OK] Commit berhasil dibuat.${NC}"
else
  echo -e "${GRAY}[i] Tidak ada perubahan file baru untuk di-commit (working tree bersih).${NC}"
fi

# -----------------------------------------------------------------------------
# STEP 4: Check Remote & Push
# -----------------------------------------------------------------------------
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 4/4: Sinkronisasi ke Remote GitHub${NC}"
echo -e "${CYAN}==================================================================${NC}"

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)

if [ -z "$ORIGIN_URL" ]; then
  if [ -n "$REMOTE_URL" ]; then
    echo -e "${CYAN}Menambahkan remote origin: ${REMOTE_URL}${NC}"
    git remote add origin "$REMOTE_URL"
    ORIGIN_URL="$REMOTE_URL"
  elif [ -t 0 ]; then
    echo ""
    echo -e "${YELLOW}[!] Remote 'origin' belum dikonfigurasi.${NC}"
    read -r -p "Masukkan URL repository GitHub (atau tekan Enter untuk lewati): " INPUT_REMOTE
    if [ -n "$INPUT_REMOTE" ]; then
      git remote add origin "$INPUT_REMOTE"
      ORIGIN_URL="$INPUT_REMOTE"
      echo -e "${GREEN}[OK] Remote origin berhasil ditambahkan: ${ORIGIN_URL}${NC}"
    fi
  fi
fi

if [ -n "$ORIGIN_URL" ]; then
  echo "Mendorong perubahan ke remote origin (${ORIGIN_URL}) pada branch '${CURRENT_BRANCH}'..."
  set +e
  git push -u origin "$CURRENT_BRANCH"
  PUSH_STATUS=$?
  set -e

  if [ $PUSH_STATUS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}==================================================================${NC}"
    echo -e "${GREEN} [SELESAI] Kode berhasil didorong ke GitHub (${CURRENT_BRANCH})!${NC}"
    echo -e "${GREEN}==================================================================${NC}"
  else
    echo ""
    echo -e "${RED}[X] GAGAL: Gagal melakukan push ke remote origin (${PUSH_STATUS}).${NC}"
    echo -e "${YELLOW}[!] Pastikan Anda memiliki izin tulis pada repository dan kredensial Git telah terkonfigurasi.${NC}"
    exit $PUSH_STATUS
  fi
else
  echo ""
  echo -e "${YELLOW}==================================================================${NC}"
  echo -e "${YELLOW} [PANDUAN] Remote 'origin' Belum Dikonfigurasi${NC}"
  echo -e "${YELLOW}==================================================================${NC}"
  echo "Repositori lokal telah siap dan perubahan telah di-commit secara aman."
  echo "Untuk menghubungkan dan mendorong kode ini ke GitHub:"
  echo ""
  echo -e "  1. Buat repository baru di GitHub: ${CYAN}https://github.com/new${NC}"
  echo "  2. Jalankan dua perintah berikut di terminal Anda:"
  echo ""
  echo "     git remote add origin https://github.com/<username>/<nama-repo>.git"
  echo "     git push -u origin $CURRENT_BRANCH"
  echo ""
  echo "Atau jalankan ulang script ini dengan opsi -r:"
  echo "     ./push.sh -r https://github.com/<username>/<nama-repo>.git"
  echo -e "${YELLOW}==================================================================${NC}"
fi

exit 0
