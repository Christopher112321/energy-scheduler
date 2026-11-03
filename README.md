# Energy-Aware Weekly Scheduler

Sistem penjadwal mingguan otomatis berbasis **Genetic Algorithm (GA)** dengan manajemen energi harian. Membedakan kegiatan tetap (locked) dan fleksibel (dioptimalkan GA).

## Fitur

- Kromosom 168 slot (7 hari x 24 jam)
- Hard constraints: slot terkunci, durasi mingguan, tidak tumpang tindih
- Soft constraints: burnout prevention, daily energy cap (per kegiatan/hari, bukan per jam), chunking, sleep window
- Input fleksibel: jam per hari × kali per minggu
- Seed reproducible untuk debugging
- UI: dual-path form, kalender interaktif, grafik energi harian

## Struktur Proyek

```
backend/     Node.js + Express (GA engine)
frontend/    React + Vite (UI)
```

## Cara Menjalankan Aplikasi

### Menjalankan dalam Mode Pengembangan

**1. Jalankan Backend (port 3001):**
```bash
cd backend
npm install
npm start
```

**2. Jalankan Frontend (port 5173):**
```bash
cd frontend
npm install
npm run dev
```

Setelah keduanya berjalan, buka [http://localhost:5173](http://localhost:5173) di browser.  
Gunakan tombol **Muat Contoh PRD** lalu **Generate Jadwal Optimal** untuk mencoba.

### Menjalankan Mode Produksi (UI & API dalam Satu Server)

1. Build frontend:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Jalankan backend (yang sekaligus melayani UI hasil build):
   ```bash
   cd ../backend
   npm install
   npm start
   ```
3. Buka [http://localhost:3001](http://localhost:3001) di browser — UI dan API terhidang dari backend.

---

## Panduan Deploy ke Komputer Lain

1. **Di komputer pengembang**, lakukan build UI:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Copy folder proyek **tanpa** `node_modules` (dari root, `backend/`, `frontend/`).  
   Pastikan **`frontend/dist/`** ikut terbawa!
3. **Di komputer penerima/deploy:**
   ```bash
   cd backend
   npm install
   node src/index.js
   ```
4. Akses via browser ke [http://localhost:3001](http://localhost:3001)

> Catatan: Tanpa folder `frontend/dist/`, UI tidak akan tampil (yang jalan hanya API).  
> Jika UI tidak tampil: jalankan `npm run build` di dalam folder `frontend/`.

---

## API

### POST `/api/schedule/generate`

- Request Body mengikuti skema PRD (lihat `backend/src/validation.js` → `getSampleInput()`).
- Untuk aktivitas fleksibel gunakan `hours_per_day` dan `times_per_week` (`total jam = kali × jam`).
- Support query/body opsional: `seed` (agar solusi reproducible/deterministik).
- Response meliputi: `schedule.slots`, `daily_energy`, `fitness`, `meta.elapsed_ms`.

---

## Algoritma GA (Gambaran Singkat)

1. Pemetaan & penguncian slot fixed
2. Inisialisasi populasi (isi acak slot free)
3. Evaluasi fitness
4. Seleksi tournament
5. Crossover & mutasi (hanya slot FREE)
6. Konvergensi (early stop jika stagnan)

Target performa: < 5 detik pada spesifikasi standar.
