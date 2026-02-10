#!/usr/bin/env python3
"""公司避雷社区 Python 后端。"""

from __future__ import annotations

import json
import os
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "10.244.102.120"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "database": os.getenv("DB_NAME", "gshmd.vip"),
    "user": os.getenv("DB_USER", "your_username"),
    "password": os.getenv("DB_PASSWORD", "your_password"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
}


def _format_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return value


def _normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: _format_value(v) for k, v in row.items()} for row in rows]


def _query_rows(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    last_err: Exception | None = None

    try:
        import pymysql  # type: ignore

        conn = pymysql.connect(
            host=DB_CONFIG["host"],
            port=DB_CONFIG["port"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            database=DB_CONFIG["database"],
            charset=DB_CONFIG["charset"],
            cursorclass=pymysql.cursors.DictCursor,
        )
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return list(cur.fetchall())
    except Exception as err:  # noqa: BLE001
        last_err = err

    try:
        import mysql.connector  # type: ignore

        conn = mysql.connector.connect(
            host=DB_CONFIG["host"],
            port=DB_CONFIG["port"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            database=DB_CONFIG["database"],
            charset=DB_CONFIG["charset"],
        )
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(sql, params)
            rows = list(cur.fetchall())
            cur.close()
            return rows
        finally:
            conn.close()
    except Exception as err:  # noqa: BLE001
        last_err = err

    try:
        import MySQLdb  # type: ignore

        conn = MySQLdb.connect(
            host=DB_CONFIG["host"],
            port=DB_CONFIG["port"],
            user=DB_CONFIG["user"],
            passwd=DB_CONFIG["password"],
            db=DB_CONFIG["database"],
            charset=DB_CONFIG["charset"],
        )
        try:
            cur = conn.cursor(MySQLdb.cursors.DictCursor)
            cur.execute(sql, params)
            rows = list(cur.fetchall())
            cur.close()
            return rows
        finally:
            conn.close()
    except Exception as err:  # noqa: BLE001
        last_err = err

    raise RuntimeError(
        "未找到可用的 MySQL Python 驱动（pymysql / mysql-connector-python / mysqlclient）。"
    ) from last_err


def _build_order(sort: str) -> str:
    if sort == "hot":
        return "ORDER BY (COALESCE(pv,0) + COALESCE(uv,0)) DESC, created_at DESC"
    return "ORDER BY COALESCE(last_update_at, updated_at, created_at) DESC"


def _get_posts_page(
    page: int,
    page_size: int,
    sort: str,
    q: str,
    anonymous_only: bool,
) -> dict[str, Any]:
    where = ["status = 1", "is_hide = 0", "parent_id IS NULL"]
    params: list[Any] = []

    if anonymous_only:
        where.append("is_anonymous = 1")
    if q:
        where.append("content LIKE %s")
        params.append(f"%{q}%")

    where_sql = " AND ".join(where)
    order_sql = _build_order(sort)

    count_sql = f"SELECT COUNT(*) AS total FROM posts WHERE {where_sql}"
    total_row = _query_rows(count_sql, tuple(params))[0]
    total = int(total_row["total"])

    offset = (page - 1) * page_size
    root_sql = f"""
SELECT
  id,
  parent_id,
  root_id,
  from_id,
  content,
  status,
  is_anonymous,
  is_disable,
  uv,
  pv,
  is_hide,
  last_comment_at,
  last_update_at,
  created_at,
  updated_at
FROM posts
WHERE {where_sql}
{order_sql}
LIMIT %s OFFSET %s
""".strip()

    root_rows = _normalize_rows(_query_rows(root_sql, tuple(params + [page_size, offset])))
    if not root_rows:
        return {"total": total, "items": []}

    root_ids = [str(row["id"]) for row in root_rows]
    placeholders = ", ".join(["%s"] * len(root_ids))
    comment_sql = f"""
SELECT
  id,
  parent_id,
  root_id,
  from_id,
  content,
  status,
  is_anonymous,
  is_disable,
  uv,
  pv,
  is_hide,
  last_comment_at,
  last_update_at,
  created_at,
  updated_at
FROM posts
WHERE status = 1 AND is_hide = 0 AND root_id IN ({placeholders})
ORDER BY created_at ASC
""".strip()

    comments = _normalize_rows(_query_rows(comment_sql, tuple(root_ids)))
    comments_by_root: dict[str, list[dict[str, Any]]] = {}
    for comment in comments:
        root_id = str(comment.get("root_id") or "")
        comments_by_root.setdefault(root_id, []).append(comment)

    for root in root_rows:
        root["comments"] = comments_by_root.get(str(root["id"]), [])

    return {"total": total, "items": root_rows}


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/posts":
            self._handle_api_posts(parsed.query)
            return

        if path == "/":
            return self._serve_file("index.html", "text/html; charset=utf-8")
        if path == "/app.js":
            return self._serve_file("app.js", "application/javascript; charset=utf-8")
        if path == "/styles.css":
            return self._serve_file("styles.css", "text/css; charset=utf-8")

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def _serve_file(self, filename: str, content_type: str) -> None:
        filepath = BASE_DIR / filename
        if not filepath.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        data = filepath.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _handle_api_posts(self, query_string: str) -> None:
        try:
            query = parse_qs(query_string)
            page = max(1, int(query.get("page", ["1"])[0]))
            page_size = int(query.get("page_size", ["10"])[0])
            if page_size not in (10, 20, 50):
                page_size = 10
            sort = query.get("sort", ["recent"])[0]
            if sort not in ("recent", "hot"):
                sort = "recent"
            q = query.get("q", [""])[0].strip()
            anonymous_only = query.get("anonymous_only", ["0"])[0] == "1"

            result = _get_posts_page(page, page_size, sort, q, anonymous_only)
            payload = {
                "ok": True,
                "data": result["items"],
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": result["total"],
                    "total_pages": max(1, (result["total"] + page_size - 1) // page_size),
                },
            }
            self._write_json(HTTPStatus.OK, payload)
        except Exception as err:  # noqa: BLE001
            payload = {
                "ok": False,
                "message": "数据库连接或查询失败，请检查配置。",
                "error": str(err),
            }
            self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, payload)

    def _write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        return


def run() -> None:
    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "4173"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Python server started at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
