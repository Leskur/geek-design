# 阶段交付记录 · 2026-11-03

本阶段：开发者检查面板、页面内操作、切图与字体体验。

## 启动与验证

Node.js 24；首次执行 `npm install`，随后 `npm run dev`。前端 5173，后端 5174。完整验证为 `npm run build` 和 `npm test`。截至本次文档更新，测试 79 项通过、1 项跳过；真实 Sketch 全量检查需配置样本。部署与数据备份参考 [部署说明](local-deployment.md)。

## 当前能力

- 登录与团队 / 项目工作台、上传、成员邀请、权限、固定稿件和内容复用。
- 默认页面内选层、测距、检查及导出；双击仅缩放定位，单画板视图按需打开，返回恢复页面视角与选择。
- 默认工具点选 / 拖动一体，4px 阈值避免误选；支持空格 / 中键平移、Ctrl / Command + 滚轮及 0 / 1 等快捷键。
- 分级缩略图、视口裁剪、最多两个操作画板完整渲染、绘制和索引缓存。
- 开发面板按图层类型展示，CSS 分布局 / 样式；文案与混合文字片段可复制。
- 原图缩略图、原图分辨率和图标下载；切图固定 PNG 1×、透明棋盘格、自适应高度、贴边裁切。
- 导出设置按需展开，支持 PNG / SVG / JPG 与倍率，下载与切图预览独立。
- 团队字体库自动匹配、普通 / 粗体检测、加载失败重试；本地临时字体明确刷新失效。
- 侧栏项目右键重命名；顶栏缩放菜单居右，分享与 AI 导出采用简短文案；网站图标为紫底白色 Logo。

## 实现入口

| 范围 | 主要文件 |
| --- | --- |
| 文档、页面与选择状态 | `src/App.tsx` |
| 页面画板渲染与交互 | `src/PageOverview.tsx`、`src/PageBoard.tsx` |
| 单画板与高亮 / 测距 | `src/Canvas.tsx` |
| 开发检查与原图下载 | `src/Inspector.tsx`、`src/properties.ts` |
| 切图预览与实际导出 | `src/SelectionExport.tsx`、`src/selection-export.tsx` |
| 缩略图、场景与索引缓存 | `src/ThumbnailCache.ts`、`src/SceneCache.ts` |
| 服务端预览 | `server/thumbnail-worker.tsx`、`server/thumbnail-jobs.ts` |
| 字体 | `src/FontPanel.tsx`、`src/RemoteDocument.ts`、`src/fonts.ts`、`src/team-fonts.ts`、`server/fonts.ts` |

操作细节见 [页面导航](viewer-navigation.md) 与 [开发检查](developer-inspector.md)。

## 产品约定与边界

面向开发交付，保持界面简洁，避免常驻技术提示。普通复制 / 下载使用小图标；字体库入口留在缺失字体弹窗内。画布空白显示可拖动手势，元素内用小箭头；不显示拖动、测量说明浮条。

复杂效果、缺失字体和远景简化文字仍可能影响还原。服务端缩略图不加载团队字体。单画板展开仍有十万图层的保护上限。切图支持任意可见图层，但父级蒙版、越界效果和可编辑 SVG 文字仍有限制；AI HTML 仅为静态视觉参考，均不自动打包字体。

跨画板多选导出、云存储、回收站、账号找回与更完整的版本能力仍待后续设计。

## 换电脑

Git 仅同步代码和文档。`data/`、Sketch 原文件、字体文件和 `.env` 不入库。保留已有账号、设计与团队字体时，停止服务后完整备份并迁移 `data/`，不要将账号数据或密钥提交到仓库。
