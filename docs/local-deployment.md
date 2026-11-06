# 源码部署

Docker 见 [README 自建服务](../README.md#自建服务)。两种方式的数据目录不同，切换时需要自己拷数据。

## 局域网

```powershell
$env:SKETCHPEEK_HOST='0.0.0.0'
$env:SKETCHPEEK_PORT='5174'
$env:SKETCHPEEK_PUBLIC_ORIGIN='http://192.168.1.100:5174'
npm run build
npm start
```

把地址换成机器实际 IP。需要 HTTPS 时走反向代理，并改 `SKETCHPEEK_PUBLIC_ORIGIN`。代理需保留 Host，不要缓冲 `/api/tus` 或改写该路径。

## 数据

默认在项目 `data/`，可用 `SKETCHPEEK_DATA_DIR` 改到本机绝对路径。同一目录只跑一个进程（`server.lock`）。备份：停服务后复制整个目录，不要只拷 SQLite 主文件，也不要放到网络盘。

`.env` 不会自动加载。上传体积默认不限制；需要上限时设 `SKETCHPEEK_MAX_FILE_SIZE`、`SKETCHPEEK_MAX_JSON_SIZE` 为正整数字节，空或 `0` 表示不限制。
