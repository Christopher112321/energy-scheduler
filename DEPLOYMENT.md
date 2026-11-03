# Panduan Deployment dan Sinkronisasi Repositori — Energy-Aware Weekly Scheduler

Dokumentasi ini menyediakan panduan komprehensif untuk mempersiapkan, melakukan verifikasi, mendorong kode (push ke Git/GitHub), serta mendistribusikan aplikasi **Energy-Aware Weekly Scheduler** ke platform **Vercel**.

---

## Daftar Isi
1. [Ringkasan Arsitektur Vercel Monorepo](#1-ringkasan-arsitektur-vercel-monorepo)
2. [Pra-syarat Sistem & Akun](#2-pra-syarat-sistem-akun)
3. [Metode 1: Deployment Langsung via Script CLI](#3-metode-1-deployment-langsung-via-script-cli)
4. [Metode 2: Deployment via Git & Vercel Dashboard](#4-metode-2-deployment-via-git-vercel-dashboard)
5. [Verifikasi Endpoint Pasca-Deployment](#5-verifikasi-endpoint-pasca-deployment)
6. [FAQ & Panduan Pemecahan Masalah](#6-faq-panduan-pemecahan-masalah)

---

## 1. Ringkasan Arsitektur Vercel Monorepo

Aplikasi ini dibangun menggunakan arsitektur monorepo terpadu yang memadukan antarmuka pengguna SPA modern dengan backend komputasi Genetic Algorithm (GA) nir-server (*serverless*).

```
┌────────────────────────────────────────────────────────────────────────┐
│                          VERCEL PLATFORM                               │
│                                                                        │
│   ┌─────────────────────────────┐    ┌─────────────────────────────┐   │
│   │    Frontend (Vite + React)  │    │  Backend (Express GA Engine)│   │
│   │      Static Edge CDN        │    │     Serverless Function     │   │
│   │     `frontend/dist/`        │    │       `api/index.js`        │   │
│   └──────────────▲──────────────┘    └──────────────▲──────────────┘   │
│                  │                                  │                  │
│       Path: `/*` │                       Path: `/api/*`                │
│                  └────────────────┬─────────────────┘                  │
│                                   │                                    │
│                            [vercel.json]                               │
│                      Routing & Rewrites Engine                         │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ HTTP(S) Request
                             [Browser Client]
```

### Komponen Utama:
1. **Frontend (Vite 6 + React 18 SPA)**:
   - Direktori: `frontend/`
   - Dibangun menjadi aset statis murni (`HTML`, `JS`, `CSS`) di `frontend/dist/`.
   - Didistribusikan secara global melalui Vercel Global Edge Network (CDN) untuk performa akses instan dan latensi minimal.
   - Menggunakan jalur relatif `/api` untuk berkomunikasi dengan backend, sehingga tidak memerlukan pengaturan domain silang (CORS) saat berada pada domain yang sama.

2. **Backend (Express 4 + GA Engine)**:
   - Direktori: `backend/`
   - Berfungsi sebagai pustaka logika utama penentuan jadwal berbasis Genetic Algorithm, perhitungan energi harian, serta pencegahan kelelahan (*burnout prevention*).
   - Dijalankan secara *stateless* tanpa basis data eksternal.

3. **Serverless Adapter (`api/index.js`)**:
   - Berada di akar proyek (`api/index.js`).
   - Mengimpor instance Express `app` dari `backend/src/index.js` dan mengekspornya sebagai Vercel Serverless Function handler.
   - Menangani seluruh panggilan API yang diarahkan ke `/api/*`.

4. **Konfigurasi Vercel (`vercel.json`)**:
   ```json
   {
     "version": 2,
     "buildCommand": "npm run build --workspace=frontend",
     "outputDirectory": "frontend/dist",
     "functions": {
       "api/index.js": {
         "maxDuration": 30
       }
     },
     "rewrites": [
       { "source": "/api/(.*)", "destination": "/api/index.js" },
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```
   - `buildCommand`: Menjalankan build bundle frontend melalui npm workspaces.
   - `outputDirectory`: Memberi tahu Vercel lokasi file statis yang siap dihidangkan (`frontend/dist`).
   - `maxDuration: 30`: Memperpanjang batas waktu eksekusi Serverless Function hingga 30 detik untuk mengakomodasi kalkulasi populasi GA yang kompleks.
   - `rewrites`: Memisahkan jalur `/api/*` ke serverless function, sementara seluruh rute navigasi lainnya dialihkan ke `index.html` untuk client-side routing.

---

## 2. Pra-syarat Sistem & Akun

Sebelum memulai proses push atau deployment, pastikan perangkat Anda memenuhi spesifikasi berikut:

| Kebutuhan | Versi Minimal | Keterangan |
|---|---|---|
| **Node.js** | `>= 18.0.0` (v20+ disarankan) | Runtime JavaScript untuk build & testing |
| **npm** | `>= 9.0.0` | Pengelola paket dengan dukungan fitur *workspaces* |
| **Git** | `>= 2.30.0` | Version control untuk manajemen kode sumber |
| **Akun GitHub** | Akun Aktif | Diperlukan jika menggunakan alur kerja repositori Git |
| **Akun Vercel** | Akun Aktif (Hobby / Pro) | Mendaftar di [vercel.com/signup](https://vercel.com/signup) |

Periksa versi perangkat lunak Anda di terminal:
```bash
node -v
npm -v
git --version
```

---

## 3. Metode 1: Deployment Langsung via Script CLI

Metode ini adalah cara paling cepat dan aman karena seluruh tahap validasi dijalankan secara otomatis sebelum file dikirim ke Vercel.

Tersedia dua skrip otomatis:
- **`deploy.ps1`**: Untuk pengguna Windows (PowerShell).
- **`deploy.sh`**: Untuk pengguna Linux, macOS, atau Windows Git Bash.

### Tahapan Otomatis Script:
1. **Pemeriksaan Lingkungan**: Memvalidasi versi Node.js (>= 18) dan npm (>= 9).
2. **Uji Integritas Kode**: Menjalankan `npm test` untuk memastikan GA engine valid.
3. **Build Frontend**: Menjalankan `npm run build` dan memverifikasi output `frontend/dist/index.html`.
4. **Deploy Vercel**: Mengeksekusi `npx --yes vercel` (dengan atau tanpa `--prod`).

---

### A. Panduan Penggunaan di Windows (PowerShell)

Buka PowerShell di direktori proyek (`c:\laragon\www\AI\UTS4\UTS2`):

#### 1. Deployment ke Lingkungan Preview:
```powershell
.\deploy.ps1
```
*Gunakan opsi ini untuk membuat URL pratinjau sementara (Preview URL) guna memeriksa fungsi sebelum dirilis resmi.*

#### 2. Deployment ke Lingkungan Production:
```powershell
.\deploy.ps1 -Prod
# atau
.\deploy.ps1 -Production
```

> **Catatan Izin Eksekusi PowerShell**:
> Jika Anda menemui pesan *`File ... cannot be loaded because running scripts is disabled on this system`*, jalankan perintah berikut sekali pada sesi PowerShell Anda:
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

---

### B. Panduan Penggunaan di Linux / macOS / Git Bash

Buka terminal di direktori proyek:

#### 1. Berikan Izin Eksekusi Skrip (Pertama Kali):
```bash
chmod +x deploy.sh push.sh
```

#### 2. Deployment ke Lingkungan Preview:
```bash
./deploy.sh
```

#### 3. Deployment ke Lingkungan Production:
```bash
./deploy.sh --prod
```

---

### C. Autentikasi Pertama Kali dengan Vercel CLI

Saat pertama kali mengeksekusi `deploy.ps1` atau `deploy.sh`:
1. Vercel CLI akan meminta Anda melakukan login:
   ```text
   Vercel CLI 39.x.x
   > Log in to Vercel (Email, GitHub, GitLab, Bitbucket)
   ```
2. Pilih metode login yang diinginkan (disarankan **Continue with GitHub**).
3. Browser akan terbuka untuk konfirmasi otorisasi.
4. Terminal akan menanyakan konfigurasi proyek:
   - *Set up and deploy?* Ketik **Y** lalu tekan Enter.
   - *Which scope do you want to deploy to?* Tekan Enter (akun pribadi Anda).
   - *Link to existing project?* Ketik **N** (jika baru pertama kali).
   - *What's your project's name?* Tekan Enter untuk nama default atau beri nama baru (misal: `energy-aware-scheduler`).
   - *In which directory is your code located?* Tekan Enter (`./`).
   - *Want to modify these settings?* Ketik **N** (Vercel otomatis membaca `vercel.json`).
5. URL deployment publik akan langsung ditampilkan pada akhir proses!

---

## 4. Metode 2: Deployment via Git & Vercel Dashboard

Metode ini direkomendasikan untuk alur kerja kolaboratif dan integrasi berkesinambungan (CI/CD). Setiap kali Anda melakukan `git push`, Vercel akan otomatis membangun dan merilis pembaruan.

---

### Langkah 1: Sinkronisasi Repositori Lokal ke GitHub

Anda dapat menggunakan script helper `push.ps1` (Windows) atau `push.sh` (Linux/Mac) yang secara otomatis mengurus `git init`, branch `main`, staging sesuai `.gitignore`, commit, dan panduan remote.

#### Menggunakan PowerShell:
```powershell
# Jalankan helper
.\push.ps1 "feat: persiapkan konfigurasi deployment Vercel"
```
Jika remote GitHub belum terhubung, Anda dapat langsung menyertakan URL remote:
```powershell
.\push.ps1 -Message "Initial commit" -RemoteUrl "https://github.com/username/energy-aware-scheduler.git"
```

#### Menggunakan Bash:
```bash
./push.sh "feat: persiapkan konfigurasi deployment Vercel"
# atau dengan menyertakan remote URL
./push.sh "Initial commit" -r "https://github.com/username/energy-aware-scheduler.git"
```

#### Atau Menggunakan Perintah Git Manual:
```bash
# 1. Inisialisasi git dan set branch utama
git init
git branch -M main

# 2. Stage seluruh file (aturan .gitignore otomatis mengabaikan node_modules, dist, dll.)
git add .

# 3. Buat commit awal
git commit -m "feat: initial commit for Vercel deployment"

# 4. Hubungkan ke repositori GitHub baru Anda
git remote add origin https://github.com/<username>/<nama-repo>.git

# 5. Push ke GitHub
git push -u origin main
```

---

### Langkah 2: Impor Proyek di Vercel Dashboard

1. Kunjungi dashboard Vercel: [https://vercel.com/dashboard](https://vercel.com/dashboard).
2. Klik tombol **"Add New..."** lalu pilih **"Project"** (atau buka [vercel.com/new](https://vercel.com/new)).
3. Pada bagian **"Import Git Repository"**, cari repositori GitHub yang baru saja Anda dorong.
4. Klik **"Import"**.

---

### Langkah 3: Konfigurasi Project Settings di Vercel

Pada halaman konfigurasi proyek Vercel:

| Parameter | Pengaturan yang Harus Diisi | Keterangan |
|---|---|---|
| **Project Name** | `energy-aware-weekly-scheduler` | Nama bebas sesuai keinginan Anda |
| **Framework Preset** | `Other` (atau `Vite`) | `vercel.json` akan mengambil alih pipeline |
| **Root Directory** | `./` | Pastikan berada di root monorepo |
| **Build Command** | *Biarkan default* atau `npm run build --workspace=frontend` | Diambil otomatis dari `vercel.json` |
| **Output Directory** | *Biarkan default* atau `frontend/dist` | Diambil otomatis dari `vercel.json` |
| **Install Command** | `npm install` | Menginstal dependensi seluruh workspace |
| **Node.js Version** | `20.x` atau `22.x` | Pilih versi Node modern pada tab Project Settings |

Klik **"Deploy"**. Vercel akan menjalankan build dan menyajikan URL produksi dalam hitungan menit.

---

## 5. Verifikasi Endpoint Pasca-Deployment

Setelah deployment selesai dan Anda memperoleh URL (misal: `https://energy-scheduler.vercel.app`), lakukan pengujian end-to-end untuk memvalidasi kelayakan fungsional:

### 1. Pengujian Antarmuka Pengguna (Frontend UI)
- Buka `https://<url-anda>.vercel.app` di peramban web (Chrome / Firefox / Edge).
- Pastikan tampilan formulir penjadwalan dan kalender mingguan muncul sempurna.
- Klik tombol **"Muat Contoh PRD"** untuk memuat 5 aktivitas sampel.
- Klik tombol **"Generate Jadwal Optimal"**.
- Amati proses kalkulasi hingga jadwal mingguan interaktif, grafik energi, dan skor fitness ditampilkan tanpa kesalahan.

---

### 2. Pengujian Endpoint Kesehatan (`GET /api/health`)
Endpoint ini memverifikasi bahwa serverless adapter `api/index.js` aktif dan melayani request Express.

**Perintah Pengujian via cURL:**
```bash
curl -i https://<url-anda>.vercel.app/api/health
```

**Respon yang Diharapkan:**
```http
HTTP/2 200
content-type: application/json; charset=utf-8

{
  "status": "ok",
  "service": "energy-scheduler"
}
```

---

### 3. Pengujian Endpoint Sampel Jadwal (`GET /api/schedule/sample`)
Endpoint ini memastikan dataset sampel PRD dapat diakses oleh klien.

**Perintah Pengujian via cURL:**
```bash
curl -s https://<url-anda>.vercel.app/api/schedule/sample | jq .
```

**Respon yang Diharapkan:**
Objek JSON yang memuat array `activities` (5 aktivitas standar) dan objek `user_preferences`.

---

### 4. Pengujian Algoritma GA (`POST /api/schedule/generate`)
Endpoint ini menguji komputasi Genetic Algorithm secara langsung melalui request HTTP POST.

**Perintah Pengujian via cURL (Windows PowerShell / Bash):**
```bash
curl -X POST https://<url-anda>.vercel.app/api/schedule/generate \
  -H "Content-Type: application/json" \
  -d '{
    "user_preferences": {
      "max_daily_energy_cap": 15,
      "max_daily_productive_hours": 8,
      "default_sleep_start": 23,
      "default_sleep_end": 5
    },
    "activities": [
      {
        "id": "ACT_01",
        "name": "Kuliah AI",
        "is_fixed": true,
        "energy_cost": 3,
        "fixed_slots": [
          { "day": "Monday", "start_hour": 10, "end_hour": 12 }
        ]
      },
      {
        "id": "ACT_02",
        "name": "Belajar Mandiri",
        "is_fixed": false,
        "energy_cost": 2,
        "hours_per_day": 2,
        "times_per_week": 2
      }
    ],
    "seed": 42
  }'
```

**Respon yang Diharapkan:**
```json
{
  "success": true,
  "fitness": 10303.98,
  "fitness_breakdown": {
    "back_to_back": 0,
    "daily_energy": 0,
    "chunking": 320,
    "preferred_slots": 0,
    "distribution": 0
  },
  "schedules": [
    {
      "rank": 1,
      "fitness": 10303.98,
      "fitness_breakdown": {
        "back_to_back": 0,
        "daily_energy": 0,
        "chunking": 320,
        "preferred_slots": 0,
        "distribution": 0
      },
      "slots": [
        {
          "activity_id": "ACT_01",
          "name": "Kuliah AI",
          "day": "Monday",
          "day_index": 0,
          "start_hour": 10,
          "end_hour": 12,
          "duration": 2,
          "energy_cost": 3,
          "is_fixed": true
        },
        {
          "activity_id": "ACT_02",
          "name": "Belajar Mandiri",
          "day": "Saturday",
          "day_index": 5,
          "start_hour": 8,
          "end_hour": 10,
          "duration": 2,
          "energy_cost": 2,
          "is_fixed": false
        }
      ],
      "daily_energy": [ ... ],
      "daily_productive_hours": [ ... ]
    }
  ],
  "meta": {
    "elapsed_ms": 25,
    "seed": 42,
    "ga_config": {
      "seed": 42,
      "generations": 120,
      "populationSize": 80
    },
    "candidates_evaluated": 5,
    "top_count": 3
  }
}
```

---

## 6. FAQ & Panduan Pemecahan Masalah

### Q1: Terjadi Error 504 Gateway Timeout (`FUNCTION_INVOCATION_TIMEOUT`)
- **Penyebab**: Batas durasi bawaan Serverless Function Vercel pada akun Hobby adalah 10 detik. Jika jumlah aktivitas fleksibel sangat banyak atau parameter generasi GA terlalu tinggi, kalkulasi dapat melampaui 10 detik.
- **Solusi yang Diterapkan**:
  Konfigurasi `vercel.json` telah menyertakan:
  ```json
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  }
  ```
  Ini meningkatkan toleransi batas eksekusi hingga 30 detik.
- **Rekomendasi Tambahan**:
  Jika Anda mengoptimalkan lebih dari 15 kegiatan kompleks, pertahankan ukuran populasi pada rentang 30–50 dan generasi 50–100 pada payload input untuk menjaga waktu kalkulasi tetap di bawah 5 detik.

---

### Q2: Endpoint API Mengembalikan 404 dalam Format HTML (Bukan JSON)
- **Penyebab**: Di lingkungan SPA, jika routing Vercel salah atau route Express tidak tertangkap, server web dapat salah mengira request API sebagai navigasi halaman dan mengembalikan `index.html`.
- **Solusi yang Diterapkan**:
  1. Urutan `rewrites` pada `vercel.json` secara eksplisit mendahulukan `/api/(.*)` sebelum `/(.*)`.
  2. File `backend/src/index.js` mengimplementasikan middleware 404 khusus untuk lingkungan Vercel (`process.env.VERCEL`):
     ```javascript
     if (process.env.VERCEL) {
       app.use((_req, res) => {
         res.status(404).json({
           success: false,
           error: 'Not Found',
           message: 'API route not found',
         });
       });
     }
     ```
  Dengan demikian, request yang salah atau tidak terdaftar pada `/api/*` dijamin menghasilkan respon JSON `404 Not Found`.

---

### Q3: Apakah Perlu Melakukan Pengaturan CORS Tambahan?
- **Penyebab & Penjelasan**:
  Dalam arsitektur monorepo ini, Frontend UI dan Serverless API disajikan pada domain publik yang identik (misal: `https://energy-scheduler.vercel.app/` dan `https://energy-scheduler.vercel.app/api/...`).
  Panggilan API menggunakan relative path `/api/*`, sehingga browser memperlakukannya sebagai *same-origin request*. Tidak ada pembatasan CORS antar-domain yang terpicu.
- **Akses Lintas Domain (Cross-Origin)**:
  Jika di kemudian hari API Anda ingin diakses dari aplikasi mobile atau frontend di domain eksternal, backend telah dilengkapi middleware Express standard `cors()` yang siap menangani request lintas domain.

---

### Q4: Perbedaan Runtime: Lokal (`npm start`) vs Vercel Serverless
- **Mode Lokal Standalone (`npm start` atau `node backend/src/index.js`)**:
  - Express menjalankan daemon HTTP server persisten pada port `3001` (`app.listen`).
  - Menyajikan file statis dari `frontend/dist` dan menyediakan fallback SPA untuk rute non-API.
- **Mode Serverless Vercel (`process.env.VERCEL=1`)**:
  - `app.listen()` dinonaktifkan agar tidak memblokir siklus hidup serverless.
  - Vercel Edge CDN bertugas penuh melayani file statis frontend langsung dari cache global.
  - Setiap request ke `/api/*` memicu eksekusi fungsi terisolasi secara *on-demand*, menghasilkan penskalaan otomatis (*auto-scaling*) tanpa biaya saat tidak ada request.

---

### Q5: Peringatan Node.js Mengenai Tipe Modul (ES Modules)
- **Status**: Terselesaikan.
- File konfigurasi akar `package.json` telah dilengkapi deklarasi `"type": "module"`, menyelaraskan seluruh workspace monorepo (`frontend`, `backend`, dan `api/index.js`) agar dieksekusi secara mulus menggunakan standar ECMAScript Modules (ESM) pada Node.js 18, 20, dan 22.

---

*Dokumentasi ini disusun dan diverifikasi untuk repositori Energy-Aware Weekly Scheduler.*
