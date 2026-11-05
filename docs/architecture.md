# 代码结构

项目使用单仓库、单份依赖管理。前端由 Vite 构建，服务端和后台进程由 esbuild 构建；当前无需拆成多个 npm 包。

## 目录与职责

| 目录 | 职责 |
| --- | --- |
| `src/` | 浏览器界面、交互、缓存和本地 / 团队文档接入 |
| `src/workspace/` | 工作台子模块：设计列表、上传弹窗和上传流程 |
| `server/` | HTTP 接口、认证与权限、SQLite、文件存储和后台任务 |
| `shared/document.ts` | 文档来源接口、现有图层类型及 Sketch 文档辅助函数 |
| `shared/fonts.ts` | 不依赖浏览器的字体名称、别名与文档字体收集 |
| `shared/rendering/` | 前后端共用的场景展开、几何计算和 React SVG 渲染 |
| `tests/` | 图层引擎、交互、界面状态和服务端集成测试 |
| `scripts/` | 开发、构建、测试和部署验证入口 |

`data/` 是运行数据；`dist/`、`.server-build/`、`.test-output/` 是生成目录，不属于源码。`release/` 和 `distribution/` 不是当前 Docker 部署所需目录。

## 文档与渲染

本地的 `SketchDocument` 和团队模式的 `RemoteDocument` 实现 `DocumentSource`，查看器通过该接口读取页面、组件与图片。

```text
本地 Sketch / 团队文档
        ↓ DocumentSource
shared/rendering/scene.ts       展开组件、覆盖值和画板场景
        ↓
shared/rendering/geometry.ts    路径、变换与布尔几何
        ↓
shared/rendering/renderer.tsx   React SVG 图层渲染
        └─ 浏览器画布实时绘制
```

共享模块不导入 `src/` 或 `server/`。浏览器专用能力留在 `src/`，例如 `src/fonts.ts` 的本机字体检测、Canvas 图片转换以及文件下载；画板预览由查看器按视口实时绘制，服务端只提供文档、页面与资源接口。

现有 `Layer` 和解析辅助函数仍基于 Sketch 数据；`DocumentSource` 目前抽象的是数据来源，并不表示已经具有通用格式模型。接入第二种文件格式时，应先定义两种格式实际需要的统一图层结构，再分别转换，避免把格式判断散落到检查面板和渲染器中。

## 工作台

`TeamHub.tsx` 负责页面组合、工作台数据和团队 / 项目操作。

- `workspace/DesignList.tsx` 负责空状态、列表 / 网格展示和设计卡片操作入口。权限判断由父级传入，实际权限始终由服务端验证。
- `workspace/useDesignUpload.ts` 持有上传状态，管理文件校验 Worker、断点上传、暂停与继续、解析轮询及资源释放。
- `workspace/UploadDialog.tsx` 展示上传状态和操作。收起弹窗只卸载界面，上传任务仍由工作台中的 hook 持有。

继续拆分工作台时，按完整业务职责提取，避免只把 JSX 搬到新文件而仍由主组件维护所有细节。

## 格式与验证

```sh
npm run format
npm run format:check
npm run check
npm test
npm run build
```

Prettier 配置位于根目录 `.prettierrc.json`，格式命令覆盖源代码、样式、测试、脚本和根目录 JSON / TypeScript 配置，不处理生成目录。

测试入口自动发现 `tests/` 直属目录中的 `*.test.ts` 和 `*.test.tsx`。新增测试无需修改入口清单，构建后的测试文件会显式传给 Node.js，避免执行输出目录中的旧测试产物。
