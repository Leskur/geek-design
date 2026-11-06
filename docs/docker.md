# Docker 部署

需要 Docker Engine / Docker Desktop 的 Linux 容器环境。当前验证目标为 Linux x64。镜像内置 Node.js 24.16.0 和运行依赖，宿主机不需要安装 Node.js，也不需要克隆仓库。

发布镜像为 `ghcr.io/leskur/geek-design`。打 `v*` 标签（例如 `v0.0.1`）并通过 Docker 工作流后，会推送 `latest` 和对应版本号。日常推 `main` 不会发布镜像。

## 启动

```sh
docker run -d --name geekdesign --restart unless-stopped -p 5174:5174 -v geekdesign-data:/app/data ghcr.io/leskur/geek-design:latest
```

访问 `http://127.0.0.1:5174`。本地文件查看入口为 `/local`；空间功能先注册账号（自动获得个人空间），再创建协作空间和文件夹。局域网默认也可访问；只给本机用时把 `-p` 改成 `127.0.0.1:5174:5174`。

首次启动会拉取 `ghcr.io/leskur/geek-design:latest`。镜像采用多阶段构建，运行阶段使用非 root 用户，包含基础字体和中文字体。设计稿中的其他字体仍需由浏览器或空间字体库提供。数据在命名卷 `geekdesign-data`。

## 改端口

容器内固定监听 5174，改的是宿主机端口，也就是 `-p` 冒号左边；右边不要改。

例如对外改成 8080：

```sh
docker run -d --name geekdesign --restart unless-stopped -p 8080:5174 -v geekdesign-data:/app/data ghcr.io/leskur/geek-design:latest
```

然后访问 `http://127.0.0.1:8080`。已经在跑的容器要先 `docker rm` 再按新端口启动，数据卷可以继续用。

Compose 在 `.env` 里写：

```ini
GEEKDESIGN_PORT=8080
```

再执行 `docker compose -p geekdesign up -d --wait`。

## 使用 Compose

想用 Compose 管理时，只需下载 `compose.yaml`：

```sh
curl -fsSL -o compose.yaml https://raw.githubusercontent.com/Leskur/geek-design/main/compose.yaml
docker compose -p geekdesign up -d --wait
```

固定使用同一个 Compose 项目名 `geekdesign`，避免因目录名不同而另建一套数据卷。Compose 创建的卷名是 `geekdesign_geekdesign-data`。需要按当前源码构建时，再克隆仓库并加上 `--build`。

## 配置与局域网访问

`docker run` 的 `-p 5174:5174` 默认绑定宿主机所有网卡，本机和局域网都可以访问。改端口见上一节。

Compose 可把 `.env.example` 复制成 `.env` 后修改：

```ini
GEEKDESIGN_BIND=0.0.0.0
GEEKDESIGN_PORT=5174
SKETCHPEEK_PUBLIC_ORIGIN=http://192.168.1.100:5174
```

`GEEKDESIGN_*` 只供 Compose 映射宿主机端口，`docker run` 用 `-p` 即可。`SKETCHPEEK_*` 两种方式都能用：`docker run` 加 `-e`，Compose 写在 `.env`。

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `GEEKDESIGN_BIND` | Compose 宿主机监听地址 | `0.0.0.0` |
| `GEEKDESIGN_PORT` | Compose 宿主机端口 | `5174` |
| `SKETCHPEEK_PUBLIC_ORIGIN` | 浏览器访问的 HTTP(S) 来源地址 | 空，允许当前请求来源 |
| `SKETCHPEEK_MAX_FILE_SIZE` | 原始上传文件上限，字节 | 空，不限制 |
| `SKETCHPEEK_MAX_JSON_SIZE` | 单个解压 JSON 上限，字节 | 空，不限制 |

HTTPS 与反向代理配置要求见 [部署说明](local-deployment.md)。使用反向代理时将 publicOrigin 设为实际的 HTTPS 地址，并保持 Host 与上传接口路径。当前版本仍主要面向本地和可信协作环境。

## 运行状态与停止

```sh
docker ps --filter name=geekdesign
docker logs -f --tail 100 geekdesign
docker stop geekdesign
docker rm geekdesign
```

`docker rm` 只删容器，数据卷仍在。Compose 对应命令是 `docker compose -p geekdesign ps|logs|stop|down`。

健康检查使用 `/api/status`，确认 Web 服务可访问；它不表示某份设计稿已经解析完成。镜像内置 tini，负责信号转发和子进程回收。Compose 停止时预留 30 秒收尾。

## 数据持久化

账号、原稿、字体、上传会话和预览保存到 `/app/data`。`docker run` 默认对应命名卷 `geekdesign-data`，Compose 对应 `geekdesign_geekdesign-data`。应用与 SQLite 按单实例运行，不支持多个容器共享同一目录。

删除容器或镜像不会删除命名卷。不要使用 `docker volume rm` 或 `compose down --volumes`，除非明确要删除该部署全部数据。

需要绑定宿主机目录时，把 `-v` 改成本机绝对目录到 `/app/data`，并保证容器 UID 1000 可写。避免网络共享目录。

## 备份、恢复与升级

备份前停止应用，备份整个数据卷，不要只复制 SQLite 主文件。例如先创建本机 `backups` 目录，再运行（Compose 把卷名换成 `geekdesign_geekdesign-data`）：

```sh
docker stop geekdesign
docker run --rm --user 0 --entrypoint tar -v geekdesign-data:/source:ro -v "${PWD}/backups:/backup" ghcr.io/leskur/geek-design:latest -C /source -czf /backup/geekdesign-data.tar.gz .
docker start geekdesign
```

`${PWD}` 在 Bash 和 PowerShell 中均表示当前目录。备份文件包含账号和设计资源，应妥善保管，不提交到仓库。

恢复时停止应用，把归档解压到新的空数据卷，保留文件权限，再将该卷映射至 `/app/data` 后启动。确认恢复成功前保留原卷与备份，不要在运行中的数据目录覆盖解压。

升级前先完成备份，然后拉取新镜像并用相同参数重建容器：

```sh
docker pull ghcr.io/leskur/geek-design:latest
docker stop geekdesign
docker rm geekdesign
docker run -d --name geekdesign --restart unless-stopped -p 5174:5174 -v geekdesign-data:/app/data ghcr.io/leskur/geek-design:latest
```

Compose 升级为 `docker compose -p geekdesign pull` 后 `up -d --wait`。按当前源码重建时，克隆仓库后执行 `docker compose -p geekdesign up -d --build --wait`。

保持同一容器名与数据卷。升级后的数据库未承诺可以直接降级，回退时应同时恢复升级前的数据备份。

## 排障

- 无法连接：检查容器状态、宿主机端口和监听地址，以及防火墙。
- 不健康或启动退出：查看日志，确认数据目录权限、可用空间和是否有其他实例占用同一目录。
- 字体或预览不同：服务端预览使用内置字体和简化远景文字，空间字体仅由浏览器加载；完整图层效果应在浏览器中核对。
- 上传过大：同时检查应用上限、反向代理请求体限制和磁盘空间。
- 构建依赖下载失败：确认 Docker 能访问基础镜像仓库、Debian 软件源、npm 及原生模块的下载来源。

`.github/workflows/docker.yml` 在相关 PR 或手动触发时构建并检查镜像；打 `v*` 标签成功后才推到 GHCR。源码开发和日常测试不需要 Docker。首次推送后若拉取 401，到 GitHub Packages 把 `geek-design` 容器包设为公开。
