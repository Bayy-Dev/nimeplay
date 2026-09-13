from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

app = Flask(__name__)
CORS(app)

UPSTREAM = "https://shivraapi.my.id/wbn"

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


def upstream_get(path, params=None):
    try:
        r = session.get(f"{UPSTREAM}{path}", params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        payload = r.json()
        data = payload.get("data", payload)
        return data, 200
    except requests.exceptions.RequestException as e:
        return {"error": f"Upstream error: {e}"}, 502
    except ValueError:
        return {"error": "Upstream returned invalid JSON"}, 502


@app.route("/api", methods=["GET"])
@app.route("/api/", methods=["GET"])
def index():
    return jsonify({
        "success": True,
        "api": "Yozora Web API",
        "endpoints": {
            "/api/home": "Top series for the homepage",
            "/api/latest?page=": "Latest anime updates",
            "/api/search?q=&page=": "Search anime/movies/tv",
            "/api/detail/<slug>": "Anime detail + episode list",
            "/api/episode/<slug>": "Episode stream & download links",
        }
    })


@app.route("/api/home", methods=["GET"])
def api_home():
    data, code = upstream_get("/home")
    status = "error" in data if isinstance(data, dict) else False
    return jsonify({"success": not status, **(data if isinstance(data, dict) else {"data": data})}), code


@app.route("/api/latest", methods=["GET"])
def api_latest():
    page = request.args.get("page", "1")
    data, code = upstream_get("/latestupdate", params={"page": page})
    status = "error" in data if isinstance(data, dict) else False
    return jsonify({"success": not status, **(data if isinstance(data, dict) else {"data": data})}), code


@app.route("/api/search", methods=["GET"])
def api_search():
    q = request.args.get("q", "").strip()
    page = request.args.get("page", "1")
    if not q:
        return jsonify({"error": "Query 'q' is required"}), 400
    data, code = upstream_get("/search", params={"q": q, "page": page})
    status = "error" in data if isinstance(data, dict) else False
    return jsonify({"success": not status, **(data if isinstance(data, dict) else {"data": data})}), code


@app.route("/api/detail/<path:slug>", methods=["GET"])
def api_detail(slug):
    data, code = upstream_get(f"/detail/{slug}")
    status = "error" in data if isinstance(data, dict) else False
    return jsonify({"success": not status, **(data if isinstance(data, dict) else {"data": data})}), code


@app.route("/api/episode/<path:slug>", methods=["GET"])
def api_episode(slug):
    data, code = upstream_get(f"/episode/{slug}")
    status = "error" in data if isinstance(data, dict) else False
    return jsonify({"success": not status, **(data if isinstance(data, dict) else {"data": data})}), code


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
