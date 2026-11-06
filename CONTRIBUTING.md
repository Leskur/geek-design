# 参与贡献

开发环境见 [README](README.md#开发)。代码结构见 [docs/architecture.md](docs/architecture.md)。部署见 [README 自建服务](README.md#自建服务)。

## 提交问题

先搜 [现有 Issues](https://github.com/Leskur/geek-design/issues)。Bug 请带版本或 commit、系统、浏览器、复现步骤。渲染差异请附局部对比，并说明字体和倍率。不要提交真实业务稿、账号、Cookie、邀请码或无权分发的字体。安全问题按 [SECURITY.md](SECURITY.md) 处理。

## 修改约定

`npm run format` 统一格式，提交前 `npm run format:check`。

- 改动聚焦，不要混入无关重排。
- 改查看器时兼顾页面与单画板、本地与空间模式。
- 权限必须由服务端验证。
- 不从图层位置猜 padding 或页面布局。
- 新增重要行为时同步文档。

## 验证

```sh
npm run format:check
npm run check
npm test
npm run build
```

`npm test` 会发现 `tests/` 里的 `*.test.ts` / `*.test.tsx`。有一项真实 Sketch 回归依赖本地 `fu-h5.sketch`，仓库不附带，缺失就跳过。界面改动请在 PR 附脱敏截图。

## Pull Request

基于当前 `main` 建分支，跑适用检查，更新受影响文档。提交即表示你有权贡献，并同意按 MIT 分发。
