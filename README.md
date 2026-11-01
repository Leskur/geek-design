# GeekDesign

面向开发者的 Sketch 网页查看与设计交付工具，在 Windows 浏览器中即可查看设计稿。

## 功能

- 本地打开 Sketch，查看页面、画板和图层。
- 悬停预览、单击直选内部元素，支持空格拖动、缩放和 Alt 测距。
- 查看文字、尺寸、颜色、描边等属性，复制文案与 CSS，预览并下载原始图片。
- 团队与项目工作台，支持成员邀请、项目权限及设计上传。
- 文件校验、分片续传、重复文件复用，以及固定稿件链接。

## 本地启动

需要 Node.js 24。

```sh
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。本地文件查看入口为 `/local`，团队模式需先注册账号。

## 部署

```sh
npm run build
npm start
```

访问 http://127.0.0.1:5174 。默认将数据库与文件保存在 `data/`，备份时请保留整个目录。局域网配置见 [部署说明](docs/local-deployment.md)，权限规则见 [账号与团队](docs/accounts-and-teams.md)。

## 技术栈

React · TypeScript · Vite · SVG · Fastify · SQLite

当前处于开发阶段，复杂效果和字体排版可能与 Sketch 存在差异；CSS 不包含页面布局，暂不支持任意图层切图。Sketch 原文件、本地数据和环境配置不提交到仓库。

运行检查：`npm run check`；运行测试：`npm test`。
