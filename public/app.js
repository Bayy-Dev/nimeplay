const API = "/api";

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function esc(s) { return (s || "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function api(path) {
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request gagal");
  return data.data !== undefined ? data.data : data;
}

/* Normalize items from different endpoints (field names vary a bit). */
function normalizeItem(item) {
  return {
    title: item.title || item.name || "Tanpa judul",
    slug: item.slug || (item.url ? slugFromUrl(item.url) : ""),
    cover: item.cover || item.poster || item.image || "",
    rating: item.rating || "",
    rank: item.rank || "",
    episode: item.episode || item.current_episode || "",
    type: item.type || "",
  };
}

function slugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

function cardHTML(raw) {
  const item = normalizeItem(raw);
  if (!item.slug) return "";
  return `
    <a class="card" href="/watch.html?slug=${encodeURIComponent(item.slug)}">
      <div class="poster">
        ${item.rank ? `<span class="rank">${esc(item.rank.toString().replace("#", ""))}</span>` : ""}
        <img src="${esc(item.cover)}" alt="${esc(item.title)}" loading="lazy">
        ${item.episode ? `<div class="badges"><span class="sub">EP ${esc(item.episode)}</span></div>` : ""}
      </div>
      <div class="title">${esc(item.title)}</div>
    </a>`;
}

/* ---------- Continue Watching (localStorage, per-anime) ---------- */
/* Catatan: iframe provider (Mega, dll) beda origin, jadi currentTime video
   di dalamnya gak bisa dibaca dari sini. Yang bisa dilacak cuma "episode
   terakhir yang dibuka per anime", bukan detik terakhir nonton. */

const CW_KEY = "yozora_continue_watching";
const CW_MAX = 20;

function getContinueWatching() {
  try {
    const list = JSON.parse(localStorage.getItem(CW_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveContinueWatching(entry) {
  let list = getContinueWatching().filter(i => i.slug !== entry.slug);
  list.unshift(entry);
  if (list.length > CW_MAX) list = list.slice(0, CW_MAX);
  try { localStorage.setItem(CW_KEY, JSON.stringify(list)); } catch {}
}

function removeContinueWatching(slug) {
  const list = getContinueWatching().filter(i => i.slug !== slug);
  try { localStorage.setItem(CW_KEY, JSON.stringify(list)); } catch {}
}

function loadContinueWatching() {
  const section = qs("#continueSection");
  const shelf = qs("#continueShelf");
  if (!section || !shelf) return;
  const list = getContinueWatching();
  if (!list.length) { section.style.display = "none"; return; }
  section.style.display = "";

  shelf.innerHTML = list.map(item => `
    <a class="card cw-card" href="/watch.html?slug=${encodeURIComponent(item.slug)}&ep=${encodeURIComponent(item.episodeSlug)}">
      <button type="button" class="cw-remove" data-slug="${esc(item.slug)}" aria-label="Hapus dari lanjut nonton">&times;</button>
      <div class="poster">
        <img src="${esc(item.cover)}" alt="${esc(item.title)}" loading="lazy">
        <div class="badges"><span class="sub">EP ${esc(item.episodeNumber)}</span></div>
      </div>
      <div class="title">${esc(item.title)}</div>
    </a>`).join("");

  qsa(".cw-remove", shelf).forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      removeContinueWatching(btn.dataset.slug);
      loadContinueWatching();
    });
  });
}

/* ---------- Home page ---------- */

async function initHome() {
  loadContinueWatching();
  loadHero();
  loadTopSeries();
  loadLatest();
}

let heroData = [];
let heroIndex = 0;
let heroTimer = null;

async function loadHero() {
  const slot = qs("#heroSlot");
  try {
    const data = await api("/home");
    const list = (data.top_series || data.banner || []).slice(0, 5);
    heroData = list.map(normalizeItem).filter(i => i.slug);
    if (!heroData.length) {
      slot.innerHTML = `<div class="error">Tidak ada data unggulan saat ini.</div>`;
      return;
    }
    renderHero();
    if (heroData.length > 1) {
      heroTimer = setInterval(() => {
        heroIndex = (heroIndex + 1) % heroData.length;
        renderHero();
      }, 6500);
    }
  } catch (e) {
    slot.innerHTML = `<div class="error">Gagal memuat beranda: ${esc(e.message)}</div>`;
  }
}

function renderHero() {
  const slot = qs("#heroSlot");
  const item = heroData[heroIndex];
  const badges = [];
  if (item.rank) badges.push(`<span class="chip">Peringkat ${esc(item.rank.toString().replace("#", ""))}</span>`);
  if (item.rating) badges.push(`<span class="chip">★ ${esc(item.rating)}</span>`);
  if (item.type) badges.push(`<span class="chip">${esc(item.type)}</span>`);

  slot.innerHTML = `
    <div class="hero" style="background-image:url('${esc(item.cover)}')">
      <div class="hero-body">
        <p class="hero-tag">Direkomendasikan</p>
        <h1 class="hero-title display">${esc(item.title)}</h1>
        <div class="hero-meta">${badges.join("")}</div>
        <a class="btn-play" href="/watch.html?slug=${encodeURIComponent(item.slug)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
          Tonton Sekarang
        </a>
      </div>
      <div class="hero-dots">
        ${heroData.map((_, i) => `<button data-i="${i}" class="${i === heroIndex ? "active" : ""}"></button>`).join("")}
      </div>
    </div>`;

  qsa(".hero-dots button", slot).forEach(btn => {
    btn.addEventListener("click", () => {
      heroIndex = Number(btn.dataset.i);
      renderHero();
      if (heroTimer) clearInterval(heroTimer);
    });
  });
}

async function loadTopSeries() {
  const grid = qs("#trendGrid");
  try {
    const data = await api("/home");
    const items = data.top_series || [];
    grid.innerHTML = items.length
      ? items.map(cardHTML).join("")
      : `<div class="empty">Belum ada data.</div>`;
  } catch (e) {
    grid.innerHTML = `<div class="error">Gagal memuat: ${esc(e.message)}</div>`;
  }
}

async function loadLatest() {
  const shelf = qs("#latestShelf");
  try {
    const data = await api("/latest");
    const items = data.latest_update || data.items || data.list || (Array.isArray(data) ? data : []);
    shelf.innerHTML = items.length
      ? items.map(cardHTML).join("")
      : `<div class="empty">Belum ada rilisan terbaru.</div>`;
  } catch (e) {
    shelf.innerHTML = `<div class="error">Gagal memuat: ${esc(e.message)}</div>`;
  }
}

async function runSearch(keyword) {
  qs("#browseSlot").style.display = "none";
  const slot = qs("#searchResultsSlot");
  slot.style.display = "block";
  qs("#searchHeading").textContent = `Hasil untuk "${keyword}"`;
  const grid = qs("#searchGrid");
  grid.innerHTML = `<div class="skeleton" style="height:220px"></div>`;
  try {
    const data = await api(`/search?q=${encodeURIComponent(keyword)}`);
    const items = data.results || data.items || data.list || (Array.isArray(data) ? data : []);
    grid.innerHTML = items.length
      ? items.map(cardHTML).join("")
      : `<div class="empty">Tidak ditemukan. Coba kata kunci lain.</div>`;
  } catch (e) {
    grid.innerHTML = `<div class="error">Pencarian gagal: ${esc(e.message)}</div>`;
  }
}

/* ---------- Watch page ---------- */

let currentAnime = null;

async function initWatch() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) {
    qs("#animeTitle").textContent = "Anime tidak ditemukan";
    return;
  }

  try {
    const info = await api(`/detail/${encodeURIComponent(slug)}`);
    qs("#animeTitle").innerHTML = esc(info.title);
    qs("#animeDesc").textContent = info.synopsis || "";
    document.title = `${info.title} — Yozora`;

    currentAnime = {
      slug,
      title: info.title || "Tanpa judul",
      cover: info.cover || info.poster || info.image || "",
    };

    const episodes = info.episodes || [];
    renderEpisodes(episodes);
  } catch (e) {
    qs("#animeTitle").textContent = "Gagal memuat";
    qs("#animeDesc").textContent = e.message;
  }
}

function episodeNumber(ep) {
  const fromSlug = (ep.slug || "").match(/episode-(\d+)/i);
  if (fromSlug) return fromSlug[1];
  const fromTitle = (ep.title || "").match(/(\d+)/);
  return fromTitle ? fromTitle[1] : ep.title || "?";
}

function renderEpisodes(episodes) {
  const grid = qs("#epGrid");
  if (!episodes.length) {
    grid.innerHTML = `<div class="empty">Belum ada episode.</div>`;
    return;
  }
  // API returns newest-first; show oldest-first for natural viewing order.
  const ordered = [...episodes].reverse();
  grid.innerHTML = ordered.map(ep => `
    <button class="ep-btn" data-slug="${esc(ep.slug)}" data-num="${esc(episodeNumber(ep))}">${esc(episodeNumber(ep))}</button>
  `).join("");

  qsa(".ep-btn", grid).forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".ep-btn", grid).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadEpisode(btn.dataset.slug, btn.dataset.num);
    });
  });

  const buttons = qsa(".ep-btn", grid);

  // Resume priority: ?ep= di URL > episode terakhir tersimpan (localStorage) > episode terbaru.
  const params = new URLSearchParams(location.search);
  const wantedEp = params.get("ep");
  let target = wantedEp ? buttons.find(b => b.dataset.slug === wantedEp) : null;

  if (!target && currentAnime) {
    const cw = getContinueWatching().find(i => i.slug === currentAnime.slug);
    if (cw) target = buttons.find(b => b.dataset.slug === cw.episodeSlug);
  }

  if (!target) target = buttons[buttons.length - 1];
  if (target) target.click();
}

function setStatus(msg) {
  const status = qs("#playerStatus");
  const frame = qs("#playerFrame");
  const skipBtn = qs("#skipServerBtn");
  status.style.display = "flex";
  status.textContent = msg;
  frame.style.display = "none";
  frame.src = "about:blank";
  if (skipBtn) skipBtn.style.display = "none";
}

async function loadEpisode(slug, epNumber) {
  setStatus("Memuat episode...");
  qs("#downloadList").innerHTML = "";
  try {
    const data = await api(`/episode/${encodeURIComponent(slug)}`);
    renderDownloads(data.downloads || []);

    if (currentAnime) {
      saveContinueWatching({
        slug: currentAnime.slug,
        title: currentAnime.title,
        cover: currentAnime.cover,
        episodeSlug: slug,
        episodeNumber: epNumber || slug,
        updatedAt: Date.now(),
      });
    }

    startAutoPlay(data.stream || []);
  } catch (e) {
    setStatus(`Gagal memuat episode: ${e.message}`);
  }
}

/* ---------- Auto server selection (no manual picking) ---------- */
/* Urutan preferensi: kualitas 1080p dulu, di dalam kualitas yang sama
   VidHide dicoba lebih dulu, baru Mega, baru provider lain.
   Kalau satu server gagal dimuat, otomatis lanjut ke kandidat berikutnya. */

const PROVIDER_PRIORITY = ["vidhide", "mega"];
const QUALITY_PRIORITY = ["1080p", "720p", "480p", "360p"];
const LOAD_TIMEOUT_MS = 8000;

function providerRank(name) {
  const n = (name || "").toLowerCase();
  const idx = PROVIDER_PRIORITY.findIndex(p => n.includes(p));
  return idx === -1 ? PROVIDER_PRIORITY.length : idx;
}

function qualityRank(q) {
  const idx = QUALITY_PRIORITY.indexOf(q);
  return idx === -1 ? QUALITY_PRIORITY.length : idx;
}

function buildPlayQueue(streams) {
  const flat = [];
  streams.forEach(group => {
    (group.links || []).forEach(l => {
      flat.push({ quality: group.quality, provider: l.provider, url: l.url });
    });
  });
  flat.sort((a, b) => {
    const qa = qualityRank(a.quality), qb = qualityRank(b.quality);
    if (qa !== qb) return qa - qb;
    return providerRank(a.provider) - providerRank(b.provider);
  });
  return flat;
}

let playQueue = [];
let playIndex = 0;
let playTimeoutId = null;

function startAutoPlay(streams) {
  playQueue = buildPlayQueue(streams);
  playIndex = 0;
  if (!playQueue.length) {
    setStatus("Tidak ada sumber streaming untuk episode ini.");
    return;
  }
  tryPlayCurrent();
}

function tryPlayCurrent() {
  if (playIndex >= playQueue.length) {
    setStatus("Semua server gagal dimuat untuk episode ini.");
    return;
  }
  const candidate = playQueue[playIndex];
  const frame = qs("#playerFrame");
  const status = qs("#playerStatus");

  setStatus(`Memuat ${candidate.provider} ${candidate.quality}...`);
  clearTimeout(playTimeoutId);

  function cleanup() {
    frame.removeEventListener("load", onLoad);
    frame.removeEventListener("error", onError);
    clearTimeout(playTimeoutId);
  }
  function onLoad() {
    cleanup();
    status.style.display = "none";
    frame.style.display = "block";
    showSkipButton();
  }
  function onError() {
    cleanup();
    playIndex++;
    tryPlayCurrent();
  }

  frame.addEventListener("load", onLoad, { once: true });
  frame.addEventListener("error", onError, { once: true });
  frame.src = candidate.url;

  // Jaga-jaga: iframe cross-origin bisa "load" walau video di dalamnya
  // sebenarnya error (gak kedeteksi dari luar). Timeout ini cuma nangkep
  // kasus koneksi/embed yang beneran gak pernah selesai dimuat.
  playTimeoutId = setTimeout(onError, LOAD_TIMEOUT_MS);
}

function showSkipButton() {
  const btn = qs("#skipServerBtn");
  if (!btn) return;
  btn.style.display = "block";
  btn.onclick = () => {
    btn.style.display = "none";
    playIndex++;
    tryPlayCurrent();
  };
}

/* Best-effort: sebagian provider embed ngirim postMessage saat video di
   dalamnya gagal/error. Kita dengerin dan coba deteksi pola umum kata
   "error"/"fail"/dsb. Kalau providernya diam aja, ini gak akan ke-trigger —
   pantau console browser (log di bawah) buat lihat apakah ada sinyal yang
   bisa dipakai, biar pattern-nya bisa disesuaikan lagi nanti. */
window.addEventListener("message", (event) => {
  const frame = qs("#playerFrame");
  if (!frame || !frame.src || frame.src === "about:blank") return;
  if (event.source !== frame.contentWindow) return;

  console.debug("[Yozora] pesan dari player embed:", event.data);

  const raw = event.data;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw || {});
  if (/\b(error|fail(ed)?|not.?found|unavailable|expired)\b/i.test(text)) {
    playIndex++;
    tryPlayCurrent();
  }
});

function renderDownloads(downloads) {
  const list = qs("#downloadList");
  if (!downloads.length) { list.innerHTML = ""; return; }
  list.innerHTML = downloads.map(group => `
    <div class="dl-row">
      <span class="dl-quality">${esc(group.quality)}</span>
      <div class="pill-group">
        ${(group.links || []).map(l => `<a class="pill" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.provider)}</a>`).join("")}
      </div>
    </div>
  `).join("");
}

/* ---------- Search form (shared) ---------- */


function bindSearchForm() {
  const form = qs("#searchForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const kw = qs("#searchInput").value.trim();
    if (!kw) return;
    if (qs("#browseSlot")) {
      runSearch(kw);
    } else {
      location.href = `/index.html?q=${encodeURIComponent(kw)}`;
    }
  });
}

bindSearchForm();

if (qs("#browseSlot")) {
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q) {
    qs("#searchInput").value = q;
    runSearch(q);
  } else {
    initHome();
  }
} else if (qs("#epGrid")) {
  initWatch();
}
