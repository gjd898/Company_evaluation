# 公司避雷社区（Python 后端）

## 启动方式

1. 配置数据库连接（使用环境变量）：

- `DB_HOST`（默认 `10.244.102.120`）
- `DB_PORT`（默认 `3306`）
- `DB_NAME`（默认 `gshmd.vip`）
- `DB_USER`
- `DB_PASSWORD`
- `DB_CHARSET`（默认 `utf8mb4`）

2. 启动 Python 服务：

```bash
APP_HOST=0.0.0.0 APP_PORT=4173 python server.py
```

3. 浏览器访问：

```text
http://127.0.0.1:4173
```

## 接口

- `GET /api/posts`
  - 返回 `posts` 表中的可见数据（`status=1` 且 `is_hide=0`）。
  - 将根帖（`parent_id is null`）和评论（`root_id` / `parent_id`）聚合返回。

## 依赖说明

`server.py` 会按顺序尝试以下 MySQL 驱动：

1. `pymysql`
2. `mysql-connector-python`
3. `mysqlclient`（`MySQLdb`）

如果你的运行环境还没安装驱动，请在你的服务器环境中安装其一后再启动。

## 安全说明

前端使用 `textContent` 渲染内容，避免帖子中的脚本被执行（XSS）。
