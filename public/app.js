const API = "/api";

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function api(path) {
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request gagal");
  return data;
}

function cardHTML(item, rank) {
  const badges = [];
  if (item.sub_episodes) badges.push(`<span class="sub">SUB ${esc(item.sub_episodes)}</span>`);
  if (item.dub_episodes) badges.push(`<span class="dub">DUB ${esc(item.dub_episodes)}</span>`);
  return `
    <a class="card" href="/watch.html?slug=${encodeURIComponent(item.slug)}">
      <div class="poster">
        ${rank ? `<span class="rank">${esc(rank)}</span>` : ""}
        <img src="${esc(item.poster)}" alt="${esc(item.title)}" loading="lazy">
        <div class="badges">${badges.join("")}</div>
      </div>
      <div class="title">${esc(item.title)}</div>
    </a>`;
}

/* ---------- Home page ---------- */

async function initHome() {
  loadHero();
  loadLatest();
  loadTrending("NOW");

  qsa("#trendTabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa("#trendTabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadTrending(btn.dataset.tab);
    });
  });
}

let heroData = [];
let heroIndex = 0;
let heroTimer = null;

async function loadHero() {
  const slot = qs("#heroSlot");
  try {
    const data = await api("/home");
    heroData = (data.banner || []).slice(0, 6);
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
  if (item.sub_episodes) badges.push(`<span class="chip sub">SUB ${esc(item.sub_episodes)}</span>`);
  if (item.dub_episodes) badges.push(`<span class="chip dub">DUB ${esc(item.dub_episodes)}</span>`);
  if (item.type) badges.push(`<span class="chip">${esc(item.type)}</span>`);
  if (item.rating) badges.push(`<span class="chip">★ ${esc(item.rating)}</span>`);

  slot.innerHTML = `
    <div class="hero" style="background-image:url('${esc(item.poster)}')">
      <div class="hero-body">
        <p class="hero-tag">${esc(item.genres || "Rekomendasi")}</p>
        <h1 class="hero-title display">${esc(item.title)}</h1>
        <p class="hero-desc">${esc(item.description)}</p>
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

async function loadLatest() {
  const shelf = qs("#latestShelf");
  try {
    const data = await api("/home");
    const items = data.latest_updates || [];
    shelf.innerHTML = items.length
      ? items.map(i => cardHTML(i)).join("")
      : `<div class="empty">Belum ada rilisan terbaru.</div>`;
  } catch (e) {
    shelf.innerHTML = `<div class="error">Gagal memuat: ${esc(e.message)}</div>`;
  }
}

async function loadTrending(tab) {
  const grid = qs("#trendGrid");
  grid.innerHTML = `<div class="skeleton" style="height:220px"></div>`;
  try {
    const data = await api("/home");
    const items = (data.top_trending || {})[tab] || [];
    grid.innerHTML = items.length
      ? items.map(i => cardHTML(i, i.rank)).join("")
      : `<div class="empty">Tidak ada data untuk kategori ini.</div>`;
  } catch (e) {
    grid.innerHTML = `<div class="error">Gagal memuat: ${esc(e.message)}</div>`;
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
    const data = await api(`/search?keyword=${encodeURIComponent(keyword)}`);
    grid.innerHTML = data.results.length
      ? data.results.map(i => cardHTML(i)).join("")
      : `<div class="empty">Tidak ditemukan. Coba kata kunci lain.</div>`;
  } catch (e) {
    grid.innerHTML = `<div class="error">Pencarian gagal: ${esc(e.message)}</div>`;
  }
}

/* ---------- Watch page ---------- */

let hlsInstance = null;
let currentServers = {};
let currentLang = null;

async function initWatch() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) {
    qs("#animeTitle").textContent = "Anime tidak ditemukan";
    return;
  }

  try {
    const info = await api(`/anime/${encodeURIComponent(slug)}`);
    qs("#animeTitle").innerHTML = `${esc(info.title)}${info.japanese_title ? `<small>${esc(info.japanese_title)}</small>` : ""}`;
    qs("#animeDesc").textContent = info.description || "";
    document.title = `${info.title} — Yozora`;

    if (!info.ani_id) {
      qs("#epGrid").innerHTML = `<div class="error">ID anime tidak ditemukan.</div>`;
      return;
    }

    const epData = await api(`/episodes/${encodeURIComponent(info.ani_id)}`);
    renderEpisodes(epData.episodes || []);
  } catch (e) {
    qs("#animeTitle").textContent = "Gagal memuat";
    qs("#animeDesc").textContent = e.message;
  }
}

function renderEpisodes(episodes) {
  const grid = qs("#epGrid");
  if (!episodes.length) {
    grid.innerHTML = `<div class="empty">Belum ada episode.</div>`;
    return;
  }
  grid.innerHTML = episodes.map(ep => `
    <button class="ep-btn" data-token="${esc(ep.token)}" data-num="${esc(ep.number)}">${esc(ep.number)}</button>
  `).join("");

  qsa(".ep-btn", grid).forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".ep-btn", grid).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadServers(btn.dataset.token);
    });
  });

  qsa(".ep-btn", grid)[0].click();
}

async function loadServers(token) {
  setStatus("Memuat server...");
  qs("#langGroup").innerHTML = "";
  qs("#serverGroup").innerHTML = "";
  try {
    const data = await api(`/servers/${encodeURIComponent(token)}`);
    currentServers = data.servers || {};
    const langs = Object.keys(currentServers);
    if (!langs.length) {
      setStatus("Tidak ada server tersedia untuk episode ini.");
      return;
    }
    currentLang = langs.includes("sub") ? "sub" : langs[0];
    qs("#langGroup").innerHTML = langs.map(l =>
      `<button class="pill lang ${l === currentLang ? "active" : ""}" data-lang="${esc(l)}">${esc(l.toUpperCase())}</button>`
    ).join("");

    qsa("#langGroup .pill").forEach(btn => {
      btn.addEventListener("click", () => {
        currentLang = btn.dataset.lang;
        qsa("#langGroup .pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderServerPills();
      });
    });

    renderServerPills();
  } catch (e) {
    setStatus(`Gagal memuat server: ${e.message}`);
  }
}

function renderServerPills() {
  const list = currentServers[currentLang] || [];
  const group = qs("#serverGroup");
  group.innerHTML = list.map((s, i) =>
    `<button class="pill ${i === 0 ? "active" : ""}" data-lid="${esc(s.link_id)}">${esc(s.name)}</button>`
  ).join("");

  qsa("#serverGroup .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa("#serverGroup .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadSource(btn.dataset.lid);
    });
  });

  if (list.length) loadSource(list[0].link_id);
  else setStatus("Server tidak tersedia untuk pilihan ini.");
}

function setStatus(msg) {
  const status = qs("#playerStatus");
  const video = qs("#video");
  status.style.display = "flex";
  status.textContent = msg;
  video.style.display = "none";
}

async function loadSource(linkId) {
  if (!linkId) { setStatus("Sumber tidak tersedia."); return; }
  setStatus("Menyiapkan video...");
  try {
    const data = await api(`/source/${encodeURIComponent(linkId)}`);
    const source = (data.sources || [])[0];
    if (!source || !source.file) { setStatus("Tidak ditemukan link video."); return; }
    playVideo(source.file);
  } catch (e) {
    setStatus(`Gagal memuat video: ${e.message}`);
  }
}

function playVideo(url) {
  const video = qs("#video");
  const status = qs("#playerStatus");

  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
  } else if (window.Hls && window.Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(video);
  } else {
    status.style.display = "flex";
    status.textContent = "Browser tidak mendukung pemutaran HLS.";
    return;
  }

  status.style.display = "none";
  video.style.display = "block";
  video.play().catch(() => {});
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
