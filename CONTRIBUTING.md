# 参与贡献

欢迎帮助 GeekDesign 改进设计稿查看、开发检查和团队交付体验。可以从反馈问题、补充文档、提供可公开的复现样本或修复代码开始。

## 提交问题

先搜索 [现有 Issues](https://github.com/Leskur/geek-design/issues)，再选择合适模板：

- Bug：提供版本或 commit、操作系统、浏览器、复现步骤、预期与实际结果。
- 渲染差异：补充原稿与 GeekDesign 的局部对比、字体是否可用、发生在页面预览还是完整图层中，以及是否与倍率有关。
- 功能建议：说明具体工作场景、当前阻碍和期望行为；较大的改动请先在 Issue 中讨论。

优先提供最小示例。不要提交真实业务稿件、账号、Cookie、邀请码、环境配置或无权分发的字体。安全问题按 [SECURITY.md](SECURITY.md) 处理。

## 准备开发环境

需要 Node.js 24 和 npm。

```sh
git clone https://github.com/Leskur/geek-design.git
cd geek-design
npm ci
npm run dev
```

外部贡献者可先 Fork 仓库，再克隆自己的 Fork，并从当前 `main` 建立分支。前端默认在 5173，后端在 5174；只运行前端可用 `npm run dev:web`，团队接口仍需后端。

生产部署、进程锁和环境变量见 [部署说明](docs/local-deployment.md)。需要隔离实验数据时，为后端进程设置独立的 `SKETCHPEEK_DATA_DIR`。`.env` 目前不自动读取。

## 代码位置

| 目录 / 文件 | 作用 |
| --- | --- |
| `src/App.tsx` | 文件、页面、选择状态和查看器顶栏 |
| `src/PageOverview.tsx`、`src/PageBoard.tsx`、`src/Canvas.tsx` | 页面与单画板交互、渲染 |
| `src/scene.ts`、`src/renderer.tsx`、`src/properties.ts` | 组件展开、绘制和 CSS 属性 |
| `src/Inspector.tsx`、`src/SelectionExport.tsx`、`src/selection-export.tsx` | 开发检查、切图与导出 |
| `server/` | 账号、权限、上传、字体、解析与预览任务 |
| `shared/` | 前后端共享类型与文档工具 |
| `tests/` | Node.js 测试与服务端集成测试 |
| `docs/` | 使用、部署和实现说明 |

## 修改约定

- 保持改动聚焦；不要混入无关的重排或格式化。
- 修改查看器时兼顾页面与单画板、本地与团队模式。
- 性能改动应说明测试页面规模和测量方式，不只依据单个小样例。
- 权限必须由服务端验证，不能只隐藏前端按钮。
- 不从图层位置猜造 padding 或完整页面布局；还原有差异时写明边界。
- 文案简洁，避免加入常驻操作说明和技术提示。新增重要行为时同步文档。

## 验证

```sh
npm run check
npm test
npm run build
```

`npm test` 会构建测试与服务端 worker，临时产物位于被忽略的 `.test-output/`，集成测试使用各自的临时数据目录。新增测试应覆盖实际行为或回归，避免仅重复实现。

当前有一项真实 Sketch 回归依赖开发者本地的特定样本 `fu-h5.sketch`，仓库不附带该业务文件，缺失时会跳过。该测试含固定样本断言，不能通过随意放一个同名文件来替代。字体测试优先读取 `TEST_FONT_PATH`，否则尝试已知的系统字体路径；没有可用字体时，对应文件往返测试会说明跳过原因。

界面改动请检查不同面板宽度、选中 / 拖动 / 缩放、预览与下载等相关交互，并在 PR 附上不含真实业务信息的截图。项目目前没有要求安装额外浏览器自动化工具才能贡献。

## Pull Request

1. 基于当前 `main` 建立分支。
2. 完成修改，并运行适用检查。
3. 更新受影响的用户文档。
4. 使用 PR 模板说明问题、最终行为、验证方式和限制；有相关 Issue 时附上链接。

提交即表示你有权贡献这些内容，并同意贡献按仓库的 MIT 许可证分发。第三方代码或素材请保留原有声明，并注明来源与授权。
