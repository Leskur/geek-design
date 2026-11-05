# Docker Compose 部署

需要 Docker Engine / Docker Desktop 的 Linux 容器环境，以及 Docker Compose v2。当前验证目标为 Linux x64。镜像内置 Node.js 24.16.0 和运行依赖，宿主机不需要安装 Node.js。

## 启动

```sh
git clone https://github.com/Leskur/geek-design.git
cd geek-design
docker compose -p geekdesign up -d --build --wait
```

访问 `http://127.0.0.1:5174`。本地文件查看入口为 `/local`；团队功能先注册账号，再创建团队和项目。

首次启动需下载基础镜像、安装依赖并构建。当前提供从源码构建的配置，尚未发布公共镜像仓库；本机镜像名为 `geekdesign:local`。镜像采用多阶段构建，运行阶段使用非 root 用户，包含基础字体和中文字体。设计稿中的其他字体仍需由浏览器或团队字体库提供。

固定使用同一个 Compose 项目名 `geekdesign`，避免因移动源码目录而意外创建另一套数据卷。以下命令也保持相同项目名。

## 配置与局域网访问

默认只绑定宿主机 `127.0.0.1`。将 `.env.example` 复制成 `.env` 后按需修改：

```ini
GEEKDESIGN_BIND=0.0.0.0
GEEKDESIGN_PORT=5174
SKETCHPEEK_PUBLIC_ORIGIN=http://192.168.1.100:5174
SKETCHPEEK_MAX_FILE_SIZE=1073741824
SKETCHPEEK_MAX_JSON_SIZE=536870912
```

把示例 IP 换成实际地址，并配置宿主机防火墙。修改配置后执行 `docker compose -p geekdesign up -d --wait` 即可应用，无需重新构建镜像。应用在容器内固定监听 5174；宿主机端口使用 `GEEKDESIGN_PORT` 调整。

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `GEEKDESIGN_BIND` | 宿主机监听地址 | `127.0.0.1` |
| `GEEKDESIGN_PORT` | 宿主机端口 | `5174` |
| `SKETCHPEEK_PUBLIC_ORIGIN` | 浏览器访问的 HTTP(S) 来源地址 | 空，允许当前请求来源 |
| `SKETCHPEEK_MAX_FILE_SIZE` | 原始上传文件上限，字节 | `1073741824` |
| `SKETCHPEEK_MAX_JSON_SIZE` | 单个解压 JSON 上限，字节 | `536870912` |

`.env` 由 Compose 读取，源码运行的 Node.js 不会自动读取此文件；`GEEKDESIGN_*` 只供 Compose 使用。配置检查：

```sh
docker compose -p geekdesign config --quiet
```

HTTPS 与反向代理配置要求见 [部署说明](local-deployment.md)。使用反向代理时将 publicOrigin 设为实际的 HTTPS 地址，并保持 Host 与上传接口路径。当前版本仍主要面向本地和可信团队环境。

## 运行状态与停止

```sh
docker compose -p geekdesign ps
docker compose -p geekdesign logs -f --tail 100
docker compose -p geekdesign stop
docker compose -p geekdesign down
```

健康检查使用 `/api/status`，确认 Web 服务可访问；它不表示某份设计稿已经解析完成。停止时预留 30 秒收尾，容器初始化器负责信号转发和子进程回收。

## 数据持久化

账号、原稿、字体、上传会话和预览保存到 `/app/data`，默认对应命名卷 `geekdesign_geekdesign-data`。应用与 SQLite 按单实例运行，不支持多个容器共享同一目录。

`docker compose down` 保留数据卷。不要使用 `down --volumes`，除非明确要删除该部署全部数据。删除镜像不会删除命名卷。

需要绑定宿主机目录时，可将 `compose.yaml` 中的映射改为绝对本机目录到 `/app/data`，并保证容器 UID 1000 可写。避免网络共享目录。构建上下文排除了真实数据目录、Sketch 文件、环境配置、日志和本机构建产物，不会把这些内容加入镜像。

## 备份、恢复与升级

备份前停止应用，备份整个数据卷，不要只复制 SQLite 主文件。例如先创建本机 `backups` 目录，再运行：

```sh
docker compose -p geekdesign stop
docker run --rm --user 0 --entrypoint tar -v geekdesign_geekdesign-data:/source:ro -v "${PWD}/backups:/backup" geekdesign:local -C /source -czf /backup/geekdesign-data.tar.gz .
docker compose -p geekdesign up -d --wait
```

`${PWD}` 在 Bash 和 PowerShell 中均表示当前目录。备份文件包含账号和设计资源，应妥善保管，不提交到仓库。

恢复时停止应用，把归档解压到新的空数据卷，保留文件权限，再将该卷映射至 `/app/data` 后启动。确认恢复成功前保留原卷与备份，不要在运行中的数据目录覆盖解压。

升级前先完成备份，然后更新源码并重新构建：

```sh
git pull --ff-only
docker compose -p geekdesign up -d --build --wait
```

保持同一 Compose 项目名与数据卷。升级后的数据库未承诺可以直接降级，回退时应同时恢复升级前的数据备份。

## 排障

- 无法连接：检查 `compose ps` 的状态、宿主机端口和监听地址，以及防火墙。
- 不健康或启动退出：查看日志，确认数据目录权限、可用空间和是否有其他实例占用同一目录。
- 字体或预览不同：服务端预览使用内置字体和简化远景文字，团队字体仅由浏览器加载；完整图层效果应在浏览器中核对。
- 上传过大：同时检查应用上限、反向代理请求体限制和磁盘空间。
- 构建依赖下载失败：确认 Docker 能访问基础镜像仓库、Debian 软件源、npm 及原生模块的下载来源。

## 开发验证

```sh
npm ci
npm run smoke:docker -- http://127.0.0.1:5174
```

烟雾验证会创建测试账号、团队、项目与设计记录，并检查静态文件、原生模块、上传和后台解析。只对新建的本机测试容器执行，不要对真实业务部署运行。

`.github/workflows/docker.yml` 在相关 PR 或手动触发时构建 Linux 镜像、运行烟雾验证，并在重建容器后验证账号数据保留。工作流不会发布镜像或创建公开 Release。源码开发和日常测试不需要 Docker。
