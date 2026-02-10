#!/usr/bin/env python3
"""公司避雷社区 Python 后端。

功能：
- 提供静态文件：/ /index.html /styles.css /app.js
- 提供接口：GET /api/posts
- 按 posts 表结构聚合根帖和评论
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "10.244.102.120"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "database": os.getenv("DB_NAME", "gshmd.vip"),
    "user": os.getenv("DB_USER", "your_username"),
    "password": os.getenv("DB_PASSWORD", "your_password"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
}


def _load_rows() -> list[dict[str, Any]]:
    """读取 posts 表数据。

    优先尝试 pymysql / mysql.connector / MySQLdb。
    若运行环境缺少驱动，会抛出清晰错误，便于用户在目标环境安装。
    """

    query = """
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
WHERE status = 1 AND is_hide = 0
ORDER BY created_at DESC
""".strip()

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
                cur.execute(query)
                rows = list(cur.fetchall())
        return rows
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
            cur.execute(query)
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
            cur.execute(query)
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


def _format_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return value


def _build_tree(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    roots: dict[str, dict[str, Any]] = {}
    comments_by_root: dict[str, list[dict[str, Any]]] = {}

    for row in rows:
        normalized = {k: _format_value(v) for k, v in row.items()}
        if normalized.get("parent_id") in (None, ""):
            normalized["comments"] = []
            roots[str(normalized["id"])] = normalized
        else:
            root_id = str(normalized.get("root_id") or normalized.get("parent_id"))
            comments_by_root.setdefault(root_id, []).append(normalized)

    for root_id, root in roots.items():
        root["comments"] = comments_by_root.get(root_id, [])

    return list(roots.values())


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/posts":
            self._handle_api_posts()
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

    def _handle_api_posts(self) -> None:
        try:
            rows = _load_rows()
            payload = {"ok": True, "data": _build_tree(rows)}
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
