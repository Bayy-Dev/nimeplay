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

/* ---------- Home page ---------- */

async function initHome() {
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

let currentStreams = [];
let currentQuality = null;

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
    <button class="ep-btn" data-slug="${esc(ep.slug)}">${esc(episodeNumber(ep))}</button>
  `).join("");

  qsa(".ep-btn", grid).forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".ep-btn", grid).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadEpisode(btn.dataset.slug);
    });
  });

  const buttons = qsa(".ep-btn", grid);
  const target = buttons[buttons.length - 1];
  if (target) target.click();
}

function setStatus(msg) {
  const status = qs("#playerStatus");
  const frame = qs("#playerFrame");
  status.style.display = "flex";
  status.textContent = msg;
  frame.style.display = "none";
  frame.src = "about:blank";
}

async function loadEpisode(slug) {
  setStatus("Memuat episode...");
  qs("#qualityGroup").innerHTML = "";
  qs("#providerGroup").innerHTML = "";
  qs("#downloadList").innerHTML = "";
  try {
    const data = await api(`/episode/${encodeURIComponent(slug)}`);
    currentStreams = data.stream || [];
    renderDownloads(data.downloads || []);

    if (!currentStreams.length) {
      setStatus("Tidak ada sumber streaming untuk episode ini.");
      return;
    }

    currentQuality = currentStreams.find(s => s.quality === "720p") ? "720p" : currentStreams[currentStreams.length - 1].quality;

    qs("#qualityGroup").innerHTML = currentStreams.map(s =>
      `<button class="pill ${s.quality === currentQuality ? "active" : ""}" data-q="${esc(s.quality)}">${esc(s.quality)}</button>`
    ).join("");

    qsa("#qualityGroup .pill").forEach(btn => {
      btn.addEventListener("click", () => {
        currentQuality = btn.dataset.q;
        qsa("#qualityGroup .pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderProviders();
      });
    });

    renderProviders();
  } catch (e) {
    setStatus(`Gagal memuat episode: ${e.message}`);
  }
}

function renderProviders() {
  const group = currentStreams.find(s => s.quality === currentQuality);
  const links = (group && group.links) || [];
  const container = qs("#providerGroup");
  container.innerHTML = links.map((l, i) =>
    `<button class="pill lang ${i === 0 ? "active" : ""}" data-url="${esc(l.url)}">${esc(l.provider)}</button>`
  ).join("");

  qsa("#providerGroup .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa("#providerGroup .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      playEmbed(btn.dataset.url);
    });
  });

  if (links.length) playEmbed(links[0].url);
  else setStatus("Tidak ada provider untuk kualitas ini.");
}

function playEmbed(url) {
  const status = qs("#playerStatus");
  const frame = qs("#playerFrame");
  if (!url) { setStatus("Link tidak tersedia."); return; }
  frame.src = url;
  status.style.display = "none";
  frame.style.display = "block";
}

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
