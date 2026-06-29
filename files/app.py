"""
Simple IP Logger with link generator and redirect tracking.
--------------------------------------
- Home page asks for a website URL.
- A short tracking link is generated after submission.
- When that link is visited, the visitor's IP and location
  are saved in the database, then the visitor is redirected
  to the original website.
"""

from flask import Flask, render_template, request, jsonify, redirect, url_for, abort
import sqlite3
import os
import urllib.request
import json
import re
import secrets
import ipaddress
from datetime import datetime

app = Flask(__name__, static_folder="Static", template_folder="templates")
# created  a file  os.pathe.join(os.path.dirname(ye dir name mang rahai hai app.py file ka)uske bas logs.db attach kerta hai ))
DB_FILE = os.path.join(os.path.dirname(__file__), "logs.db")
GEO_API_TEMPLATE = "http://ip-api.com/json/{ip}?fields=status,country,regionName,city,zip,isp"


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            target_url TEXT,
            created_at TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS visit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            visited_at TEXT,
            country TEXT,
            region TEXT,
            city TEXT,
            isp TEXT,
            zip TEXT,
            FOREIGN KEY(target_id) REFERENCES targets(id)
        )
    """)
    conn.commit()
    conn.close()


def normalize_url(value):
    if not value:
        return None

    url = value.strip()
    if not url:
        return None

    if not re.match(r"^https?://", url, re.I):
        url = "http://" + url

    return url


def slug_exists(slug):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM targets WHERE slug = ?", (slug,))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


def generate_slug(length=6):
    while True:
        slug = secrets.token_urlsafe(length)[:length]
        if not slug_exists(slug):
            return slug


def create_target(target_url):
    slug = generate_slug()
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO targets (slug, target_url, created_at) VALUES (?, ?, ?)",
        (slug, target_url, created_at),
    )
    conn.commit()
    conn.close()
    return slug


def get_target(slug):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, slug, target_url FROM targets WHERE slug = ?", (slug,)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row[0], "slug": row[1], "target_url": row[2]}


def lookup_location(ip):
    if not ip:
        return {}

    try:
        parsed_ip = ipaddress.ip_address(ip)
        if parsed_ip.is_private or parsed_ip.is_loopback or parsed_ip.is_reserved:
            return {
                "country": "Private IP",
                "region": "Local Network",
                "city": "Local / Reserved",
                "zip": "",
                "isp": "Private"
            }
    except ValueError:
        return {}

    try:
        url = GEO_API_TEMPLATE.format(ip=ip)
        with urllib.request.urlopen(url, timeout=6) as response:
            data = json.load(response)

        if data.get("status") != "success":
            return {}

        return {
            "country": data.get("country", "Unknown"),
            "region": data.get("regionName", "Unknown"),
            "city": data.get("city", "Unknown"),
            "zip": data.get("zip", ""),
            "isp": data.get("isp", "Unknown"),
        }
    except Exception:
        return {
            "country": "Unknown",
            "region": "Unknown",
            "city": "Unknown",
            "zip": "",
            "isp": "Unknown",
        }


def get_visitor_ip():
    forwarded = request.headers.get("X-Forwarded-For", None)
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr


def log_visit(target_id):
    ip = get_visitor_ip()
    user_agent = request.headers.get("User-Agent", "Unknown")
    visited_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    location = lookup_location(ip)

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO visit_logs (
            target_id,
            ip_address,
            user_agent,
            visited_at,
            country,
            region,
            city,
            isp,
            zip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            target_id,
            ip,
            user_agent,
            visited_at,
            location.get("country", ""),
            location.get("region", ""),
            location.get("city", ""),
            location.get("isp", ""),
            location.get("zip", ""),
        ),
    )
    conn.commit()
    conn.close()


@app.route("/", methods=["GET", "POST"])
def home():
    created_url = None
    target_url = None
    error = None

    if request.method == "POST":
        raw_url = request.form.get("target_url", "")
        target_url = normalize_url(raw_url)
        if not target_url:
            error = "Please enter a valid website URL."
        else:
            slug = create_target(target_url)
            return redirect(url_for("dashboard", created_slug=slug))

    return render_template(
        "index.html",
        created_url=created_url,
        target_url=target_url,
        error=error,
    )


@app.route("/s/<slug>")
def redirect_link(slug):
    target = get_target(slug)
    if not target:
        abort(404)

    log_visit(target["id"])
    return redirect(target["target_url"])


@app.route("/dashboard")
def dashboard():
    created_slug = request.args.get("created_slug")
    created_url = None
    target_url = None
    if created_slug:
        target = get_target(created_slug)
        if target:
            created_url = url_for("redirect_link", slug=created_slug, _external=True)
            target_url = target["target_url"]

    return render_template("dashboard.html", created_url=created_url, target_url=target_url)


@app.route("/api/logs")
def api_logs():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            v.id,
            t.slug,
            t.target_url,
            v.ip_address,
            v.city,
            v.region,
            v.country,
            v.isp,
            v.zip,
            v.visited_at,
            v.user_agent
        FROM visit_logs v
        LEFT JOIN targets t ON t.id = v.target_id
        ORDER BY v.id DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()

    logs = []
    for row in rows:
        logs.append(
            {
                "id": row[0],
                "slug": row[1] or "",
                "target_url": row[2] or "",
                "ip_address": row[3] or "",
                "city": row[4] or "",
                "region": row[5] or "",
                "country": row[6] or "",
                "isp": row[7] or "",
                "zip": row[8] or "",
                "visited_at": row[9] or "",
                "user_agent": row[10] or "",
            }
        )

    return jsonify(logs)


@app.route("/api/targets")
def api_targets():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            t.id,
            t.slug,
            t.target_url,
            t.created_at,
            COUNT(v.id) AS visit_count
        FROM targets t
        LEFT JOIN visit_logs v ON v.target_id = t.id
        GROUP BY t.id
        ORDER BY t.created_at DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()

    targets = []
    for row in rows:
        targets.append(
            {
                "id": row[0],
                "slug": row[1],
                "target_url": row[2],
                "created_at": row[3],
                "visit_count": row[4],
            }
        )

    return jsonify(targets)


@app.route("/api/logs/clear", methods=["POST"])
def clear_logs():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM visit_logs")
    conn.commit()
    conn.close()
    return jsonify({"status": "cleared"})


if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="0.0.0.0", port=5000)
