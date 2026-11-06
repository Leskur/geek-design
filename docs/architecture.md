# 代码结构

前端 Vite，服务端和后台 esbuild，一份依赖。

| 目录 | 职责 |
| --- | --- |
| `src/` | 浏览器界面、交互、缓存，以及本地 / 空间设计接入 |
| `src/workspace/` | 设计列表、上传弹窗和上传流程 |
| `server/` | HTTP、认证、SQLite、文件存储和后台任务 |
| `shared/document.ts` | 文档来源接口和 Sketch 辅助函数 |
| `shared/fonts.ts` | 字体名称、别名与文档字体收集 |
| `shared/rendering/` | 场景展开、几何和 React SVG 渲染 |
| `tests/` | 图层、交互、界面和服务端测试 |
| `scripts/` | 开发、构建、测试入口 |

`data/` 是运行数据；`dist/`、`.server-build/`、`.test-output/` 是生成目录。

本地 `SketchDocument` 和空间 `RemoteDocument` 都实现 `DocumentSource`。查看器只通过它读页面、组件和图片。`shared/` 不导入 `src/` 或 `server/`。

`TeamHub.tsx` 组合工作台。`useDesignUpload.ts` 管上传任务；收起弹窗只卸界面，任务仍在。权限判断前端可藏按钮，实际始终由服务端验证。
