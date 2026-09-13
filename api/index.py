from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib.parse import unquote

app = Flask(__name__)
CORS(app)

# Winbu = sumber utama. Otakudesu = cadangan (dipakai juga sebagai satu-satunya
# sumber utk /completed, karena Winbu emang gak nyediain data anime tamat).
UPSTREAM_WBN = "https://shivraapi.my.id/wbn"
UPSTREAM_OTD = "https://shivraapi.my.id/otd"

# Penanda di depan slug utk item yang datang dari Otakudesu, biar /detail &
# /episode tau harus nembak upstream mana pas item itu diklik nanti.
SRC_PREFIX = "otd:"

_retry = Retry(
    total=3,
    connect=3,
    read=2,
    backoff_factor=0.5,
    status_forcelist=[502, 503, 504],
    allowed_methods=["GET"],
)
session = requests.Session()
session.mount("https://", HTTPAdapter(max_retries=_retry))

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}


def upstream_get(base, path, params=None):
    try:
        r = session.get(f"{base}{path}", params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        payload = r.json()
        data = payload.get("data", payload)
        return data, 200
    except requests.exceptions.RequestException as e:
        return {"error": f"Upstream error: {e}"}, 502
    except ValueError:
        return {"error": "Upstream returned invalid JSON"}, 502


def _tag_item(item):
    """Tandain slug satu item otakudesu dgn prefix 'otd:' (bikin dulu dari
    url kalau field slug-nya gak ada)."""
    if not isinstance(item, dict):
        return item
    slug = item.get("slug")
    if not slug and item.get("url"):
        try:
            slug = [p for p in str(item["url"]).rstrip("/").split("/") if p][-1]
        except Exception:
            slug = None
    if slug and not str(slug).startswith(SRC_PREFIX):
        item["slug"] = f"{SRC_PREFIX}{slug}"
    return item


def tag_source(data):
    """Cari list item di response Otakudesu (nama key-nya suka beda2 tiap
    endpoint) lalu tandain slug tiap item. Kalau data-nya cuma satu objek
    detail (punya field 'episodes'), tandain juga slug tiap episodenya."""
    list_keys = ("data", "list", "items", "results", "animeList", "anime_list", "anime")
    if isinstance(data, list):
        return [_tag_item(i) for i in data]
    if isinstance(data, dict):
        tagged = dict(data)
        found_list = False
        for key in list_keys:
            if isinstance(tagged.get(key), list):
                tagged[key] = [_tag_item(i) for i in tagged[key]]
                found_list = True
        if isinstance(tagged.get("episodes"), list):
            tagged["episodes"] = [_tag_item(e) for e in tagged["episodes"]]
        if not found_list:
            _tag_item(tagged)
        return tagged
    return data


def split_source(slug):
    """slug diawali 'otd:' -> asalnya Otakudesu (cadangan). Selain itu -> Winbu (utama).
    Vercel kadang gak ngedecode %3A -> ':' sebelum sampe ke Flask, jadi decode
    manual dulu di sini biar gak salah routing ke upstream."""
    slug = unquote(slug)
    if slug.startswith(SRC_PREFIX):
        return UPSTREAM_OTD, slug[len(SRC_PREFIX):]
    return UPSTREAM_WBN, slug


def respond(data, code):
    status = "error" in data if isinstance(data, dict) else False
    return jsonify({"success": not status, **(data if isinstance(data, dict) else {"data": data})}), code


@app.route("/api", methods=["GET"])
@app.route("/api/", methods=["GET"])
def index():
    return jsonify({
        "success": True,
        "api": "Yozora Web API",
        "endpoints": {
            "/api/home": "Top series for the homepage",
            "/api/latest?page=": "Latest anime updates",
            "/api/completed?page=": "Completed / tamat anime (sumber: Otakudesu)",
            "/api/search?q=&page=": "Search anime/movies/tv",
            "/api/detail/<slug>": "Anime detail + episode list",
            "/api/episode/<slug>": "Episode stream & download links",
        }
    })


@app.route("/api/home", methods=["GET"])
def api_home():
    data, code = upstream_get(UPSTREAM_WBN, "/home")
    if code != 200:
        data, code = upstream_get(UPSTREAM_OTD, "/home")
        if code == 200:
            data = tag_source(data)
    return respond(data, code)


@app.route("/api/latest", methods=["GET"])
def api_latest():
    page = request.args.get("page", "1")
    data, code = upstream_get(UPSTREAM_WBN, "/latestupdate", params={"page": page})
    if code != 200:
        # Otakudesu gak punya "latest update" persis, /ongoing paling deket konsepnya.
        data, code = upstream_get(UPSTREAM_OTD, "/ongoing", params={"page": page})
        if code == 200:
            data = tag_source(data)
    return respond(data, code)


@app.route("/api/completed", methods=["GET"])
def api_completed():
    """Winbu gak nyediain anime tamat sama sekali, jadi ini SELALU dari Otakudesu."""
    page = request.args.get("page", "1")
    data, code = upstream_get(UPSTREAM_OTD, "/completed", params={"page": page})
    if code == 200:
        data = tag_source(data)
    return respond(data, code)


@app.route("/api/search", methods=["GET"])
def api_search():
    q = request.args.get("q", "").strip()
    page = request.args.get("page", "1")
    if not q:
        return jsonify({"error": "Query 'q' is required"}), 400
    data, code = upstream_get(UPSTREAM_WBN, "/search", params={"q": q, "page": page})
    if code != 200:
        data, code = upstream_get(UPSTREAM_OTD, "/search", params={"q": q})
        if code == 200:
            data = tag_source(data)
    return respond(data, code)


@app.route("/api/detail/<path:slug>", methods=["GET"])
def api_detail(slug):
    base, real_slug = split_source(slug)
    path = f"/anime/{real_slug}" if base == UPSTREAM_OTD else f"/detail/{real_slug}"
    data, code = upstream_get(base, path)
    if code == 200 and base == UPSTREAM_OTD:
        data = tag_source(data)
    return respond(data, code)


@app.route("/api/episode/<path:slug>", methods=["GET"])
def api_episode(slug):
    base, real_slug = split_source(slug)
    data, code = upstream_get(base, f"/episode/{real_slug}")
    return respond(data, code)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
