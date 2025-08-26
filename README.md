# ATR BPN — DMS QR v6.6.3 (pg-only)

- Koneksi DB: **pg TCP 5432** (tanpa serverless)
- Fix klik **Mulai** pertama (status WAITING), berikutnya buka aktivitas 1
- Waiting/Resting jam kerja 08:00–17:00 WIB

## Jalankan
```
cd backend
cp .env.example .env   # isi DATABASE_URL Neon (pooler) + PG_SSL=true
npm i
npm run migrate
npm run seed
npm run dev
```
Frontend:
```
cd ../frontend
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:4000/api
npm i
npm run dev
```

Build time: 2025-08-25 09:40:25 UTC
