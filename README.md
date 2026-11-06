<p align="center">
  <img src="src/assets/geekdesign.svg" width="96" alt="GeekDesign Logo" />
</p>

# GeekDesign

在浏览器里打开 `.sketch` 文件：看页面、量图层、复制样式、下载切图。不必安装 Sketch，也不必把稿传到蓝湖、Pixso、MasterGo。

只看本机文件，打开网页就能用。要和同事共享稿件和字体，再自己部署一份。

[功能](#功能) · [怎么用](#怎么用) · [Issues](https://github.com/Leskur/geek-design/issues)

![GeekDesign 页面查看与开发检查面板](docs/screenshots/open-source-viewer.png)

*截图使用项目自制演示数据，不含真实业务设计稿。*

## 功能

- 按原稿布局查看画板，检查图层、字体和 CSS，复制文案，Alt 测距。
- 下载原图；没有预设切图也能导出 PNG / SVG / JPG。
- 把选中画板打成 AI 交付包。
- 注册后自动获得个人空间；也可以建协作空间、邀请成员、上传字体。每个设计只有当前一份稿，覆盖上传即更新。

更细的检查、切图和空间规则见 [文档](docs/README.md)。

## 怎么用

### 打开文件

https://leskur.github.io/geek-design-viewer/

选择本机 `.sketch` 即可。文件只在浏览器里处理，不会上传。

### 自建服务

给需要空间、邀请、共享稿件和字体的人。装好 Docker 后：

```sh
docker run -d --name geekdesign --restart unless-stopped -p 5174:5174 -v geekdesign-data:/app/data ghcr.io/leskur/geek-design:latest
```

打开 http://127.0.0.1:5174 注册即可。局域网默认可访问，数据在卷 `geekdesign-data`。

没有 Docker 时：`npm run build && npm start`，默认只监听本机，数据在 `data/`。升级、备份和端口见 [Docker 部署](docs/docker.md)、[源码部署](docs/local-deployment.md)。

### 开发

需要 Node.js 24。

```sh
git clone https://github.com/Leskur/geek-design.git
cd geek-design
npm ci
npm run dev
```

http://127.0.0.1:5173 是前端，后端在 5174。本地看稿走 `/local`，空间走 `/register`。

贡献前请看 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题见 [SECURITY.md](SECURITY.md)。

## 许可证

代码和项目自有文档为 [MIT License](LICENSE)。你上传的设计稿、字体和图片仍归原权利人，请确认有权使用。
