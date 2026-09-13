# Yozora — Nonton Anime (AnimeKAI Web)

Web nonton anime sederhana. Frontend statis (HTML/CSS/JS) + backend Flask
(proxy ke ShivraAPI Winbu — `https://shivraapi.my.id/wbn`) jadi satu project,
deploy ke Vercel sekaligus.

Player pakai `<iframe>` karena link stream dari API ini berupa embed
(MEGA, VidHide, Kraken, dll), bukan link `.m3u8` langsung.

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

- Semua data (home, search, detail, episode) diproksi langsung dari ShivraAPI
  Winbu saat request masuk — tidak ada database di sisi kita.
- Field pada `/home` dan `/search` divalidasi longgar di `app.js`
  (`normalizeItem`) karena nama field API pihak ketiga bisa sedikit berbeda
  antar endpoint. Kalau tampilan kartu kosong/aneh, cek nama field asli di
  response API tsb dan sesuaikan `normalizeItem`.
- Kalau ShivraAPI ubah struktur endpoint, cukup sesuaikan `api/index.py`.
- Untuk penggunaan pribadi/edukasi.
