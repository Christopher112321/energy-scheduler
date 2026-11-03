#!/usr/bin/env bash
# =============================================================================
# Energy-Aware Weekly Scheduler - Vercel Deployment Automation (Bash)
# =============================================================================
# Description:
#   Performs pre-flight checks (Node.js >= 18, npm >= 9), runs backend test
#   suite (npm test), executes frontend production build (npm run build),
#   and deploys the project to Vercel via Vercel CLI (npx --yes vercel).
#
# Usage:
#   ./deploy.sh                # Deploy to Vercel Preview
#   ./deploy.sh --prod         # Deploy to Vercel Production
#   ./deploy.sh --help         # Show help message
# =============================================================================

set -e

# Terminal colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROD_MODE=false

# Parse command line flags
for arg in "$@"; do
  case "$arg" in
    --prod|--production|-p)
      PROD_MODE=true
      shift
      ;;
    --help|-h)
      echo "Penggunaan: ./deploy.sh [OPSI]"
      echo ""
      echo "Opsi:"
      echo "  --prod, --production, -p   Deploy langsung ke lingkungan Production Vercel"
      echo "  --help, -h                 Tampilkan bantuan ini"
      echo ""
      echo "Contoh:"
      echo "  ./deploy.sh                # Preview deployment"
      echo "  ./deploy.sh --prod         # Production deployment"
      exit 0
      ;;
    *)
      echo -e "${YELLOW}[!] Argumen tidak dikenal diabaikan: $arg${NC}"
      ;;
  esac
done

if [ "$PROD_MODE" = true ]; then
  TARGET_ENV="PRODUCTION"
else
  TARGET_ENV="PREVIEW"
fi

echo -e "${CYAN}------------------------------------------------------------------${NC}"
echo -e "${CYAN} Energy-Aware Weekly Scheduler - Vercel Deployment Automation${NC}"
echo -e " Target Lingkungan : ${YELLOW}${TARGET_ENV}${NC}"
echo -e " Root Proyek       : ${SCRIPT_DIR}"
echo -e "${CYAN}------------------------------------------------------------------${NC}"

# =============================================================================
# STEP 1: Pre-Flight Environment Checks (Node.js & npm)
# =============================================================================
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 1/3: Pemeriksaan Lingkungan & Versi (Pre-flight Checks)${NC}"
echo -e "${CYAN}==================================================================${NC}"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[X] GAGAL: Node.js tidak ditemukan di PATH sistem.${NC}"
  echo -e "Silakan instal Node.js versi 18 atau lebih baru (https://nodejs.org)."
  exit 1
fi

NODE_RAW_VERSION="$(node -v)"
echo -e "Terdeteksi Node.js: ${NODE_RAW_VERSION}"

# Extract major version number (e.g., v22.20.0 -> 22)
NODE_MAJOR=$(echo "$NODE_RAW_VERSION" | sed -E 's/^v?([0-9]+).*/\1/')
if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}[X] GAGAL: Node.js versi ${NODE_RAW_VERSION} tidak didukung. Diperlukan Node.js >= 18.0.0.${NC}"
  exit 1
fi

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}[X] GAGAL: npm tidak ditemukan di PATH sistem.${NC}"
  exit 1
fi

NPM_RAW_VERSION="$(npm -v)"
echo -e "Terdeteksi npm    : ${NPM_RAW_VERSION}"

NPM_MAJOR=$(echo "$NPM_RAW_VERSION" | sed -E 's/^([0-9]+).*/\1/')
if [ -n "$NPM_MAJOR" ] && [ "$NPM_MAJOR" -lt 9 ]; then
  echo -e "${RED}[X] GAGAL: npm versi ${NPM_RAW_VERSION} tidak didukung. Diperlukan npm >= 9.0.0 (npm workspaces).${NC}"
  exit 1
fi

echo -e "${GREEN}[OK] Pemeriksaan versi Node.js (${NODE_RAW_VERSION}) dan npm (${NPM_RAW_VERSION}) lolos.${NC}"

# =============================================================================
# STEP 2: Pre-Deployment Verification (npm test & npm run build)
# =============================================================================
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 2/3: Verifikasi Integritas Proyek (Pengujian & Build)${NC}"
echo -e "${CYAN}==================================================================${NC}"

echo "Menjalankan suite pengujian backend (npm test)..."
npm test
echo -e "${GREEN}[OK] Seluruh pengujian backend berhasil dilewati.${NC}"

echo "Membangun frontend untuk produksi (npm run build)..."
npm run build

if [ ! -f "$SCRIPT_DIR/frontend/dist/index.html" ]; then
  echo -e "${RED}[X] GAGAL: File 'frontend/dist/index.html' tidak ditemukan setelah build selesai.${NC}"
  exit 1
fi
echo -e "${GREEN}[OK] Build bundle frontend berhasil diverifikasi di 'frontend/dist'.${NC}"

# =============================================================================
# STEP 3: Vercel CLI Deployment
# =============================================================================
echo ""
echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}>> Langkah 3/3: Melakukan Deployment ke Vercel (${TARGET_ENV})${NC}"
echo -e "${CYAN}==================================================================${NC}"

if ! command -v npx >/dev/null 2>&1; then
  echo -e "${RED}[X] GAGAL: npx tidak ditemukan di PATH sistem.${NC}"
  exit 1
fi

VERCEL_ARGS=("--yes" "vercel")
if [ "$PROD_MODE" = true ]; then
  VERCEL_ARGS+=("--prod")
  echo -e "${YELLOW}Menjalankan deployment PRODUKSI: npx --yes vercel --prod${NC}"
else
  echo -e "${YELLOW}Menjalankan deployment PREVIEW: npx --yes vercel${NC}"
fi

# Run Vercel CLI with error capture
set +e
npx "${VERCEL_ARGS[@]}"
DEPLOY_STATUS=$?
set -e

if [ $DEPLOY_STATUS -ne 0 ]; then
  echo ""
  echo -e "${RED}[X] GAGAL: Proses deployment Vercel keluar dengan kode kesalahan ${DEPLOY_STATUS}.${NC}"
  echo ""
  echo -e "${YELLOW}[!] Tips:${NC}"
  echo "  1. Jika belum login ke akun Vercel, jalankan: npx vercel login"
  echo "  2. Jika proyek belum dikaitkan (linked), jalankan: npx vercel link"
  exit $DEPLOY_STATUS
fi

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} [SELESAI] Deployment ${TARGET_ENV} berhasil dipublikasikan ke Vercel!${NC}"
echo -e "${GREEN}==================================================================${NC}"
exit 0
