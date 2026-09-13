# Yozora — Nonton Anime (AnimeKAI Web)

Web nonton anime sederhana. Frontend statis (HTML/CSS/JS) + backend Flask
(scraper AnimeKAI, diadaptasi dari `liostark99-code/AnimeKAI-API`) jadi satu
project, deploy ke Vercel sekaligus.

## Struktur

```
api/index.py     -> serverless function Flask (semua endpoint /api/*)
public/          -> frontend statis (index.html, watch.html, style.css, app.js)
vercel.json      -> routing: /api/* -> Flask, sisanya -> file statis
requirements.txt -> dependency Python
```

## Deploy ke Vercel

1. Push folder ini ke repo GitHub baru.
2. Buka vercel.com -> **Add New Project** -> import repo tadi.
3. Vercel otomatis detect `vercel.json`, tidak perlu ubah build settings apa pun.
4. Klik **Deploy**.

## Coba lokal (opsional)

```bash
pip install -r requirements.txt
cd api && python index.py
```
Backend jalan di `http://localhost:5000`. Untuk lihat frontend, buka file di
`public/` lewat live server mana pun, lalu ubah `API` di `app.js` ke
`http://localhost:5000/api` sementara testing lokal.

## Catatan

- Semua data (search, episode, link streaming) di-scrape langsung dari
  `anikai.to` saat request masuk — tidak ada database.
- Kalau AnimeKAI ubah struktur HTML mereka, endpoint scraping bisa berhenti
  bekerja dan perlu disesuaikan lagi di `api/index.py`.
- Untuk penggunaan pribadi/edukasi.
