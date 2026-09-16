# 智能简历构建器

一款纯前端智能简历构建器，支持本地多版本简历管理、模块化编辑、模板切换、A4 预览和 PDF 导出。

## 功能列表

- 简历列表：创建、复制、删除多份简历版本。
- 简历编辑器：左侧模块拖拽排序，中间结构化编辑，右侧实时预览。
- 模板选择：内置 6 套简历模板，可应用到当前简历并作为新建默认模板。
- PDF 导出预览：A4 比例预览，支持页边距、字号调整和 PDF 导出。
- 个人资料：维护姓名、联系方式、头像、求职意向等全局资料。
- 脱敏投递台：每份简历独立配置电话、邮箱、地址、头像、主页的保留/遮蔽/省略，以及正文证件号、薪资、出生日期的保留/遮蔽/省略（省略会从摘要与工作、项目、教育等正文里整段移除命中内容，不留原值或星号）；规则只作用于预览与 PDF 导出，不改写原简历或全局资料，复制后独立、旧备份可打开、连续导出幂等不叠加。
- 本地持久化：简历、个人资料、主题偏好和模板偏好存储在 localStorage。
- JSON 导入导出：支持完整工作区备份和恢复。
- 主题切换：亮色/暗色主题，所有组件通过 CSS 变量消费主题色。

## 快速启动

```bash
cd frontend
npm install
npm run dev
```

开发服务器端口固定为 `28310`：

```text
http://localhost:28310
```

构建与预览：

```bash
npm run build
npm run preview
```

测试均从项目入口一键运行，服务自动启动与回收，用例互相隔离、可连续重复运行；失败信息带「字段 + 阶段」。

```bash
npm run test:e2e            # 全部：先 DOM 测试，再真实浏览器测试（自动起停 Vite:28310）

npm run test:dom            # 仅 jsdom + Vitest（tests/e2e/，真实路由/页面/store/localStorage）
npm run test:dom:watch

npm run test:browser        # 仅真实 Chromium（Playwright，tests/browser/）
npm run test:browser:install  # 首次：下载 Chromium
```

- **DOM 测试** `frontend/tests/e2e/`：挂载真实 `createBrowserRouter` 与全部页面，逐用例清空 localStorage + 重置模块（等价整页刷新），`relaunchAt` 模拟刷新重开。
- **真实浏览器测试** `frontend/tests/browser/`：Playwright 驱动 Chromium 访问真实 Vite 页面，覆盖中文金额（一万八千元/两万五千元）三态、出生日期附着说明的省略清理、刷新重开与复制隔离。无 root 环境下 Chromium 缺库时，`scripts/setup-browser-env.sh` 会把依赖以非 root 方式解压到 gitignored 的 `.playwright-libs/`（CI 可改用 `npx playwright install-deps chromium`）。
- `npm run typecheck:test` 连同测试文件做类型检查。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式 | Tailwind CSS + SCSS CSS Variables |
| 无障碍交互 | Headless UI |
| 状态管理 | Zustand |
| 拖拽排序 | react-beautiful-dnd |
| PDF 导出 | html2canvas + jsPDF |
| 日期工具 | dayjs |
| 数据持久化 | localStorage |

## 目录结构

```text
frontend/
├── public/
├── src/
│   ├── api/
│   ├── stores/
│   ├── types/
│   ├── components/
│   │   ├── common/
│   │   ├── editor/
│   │   └── preview/
│   ├── hooks/
│   ├── pages/
│   ├── router/
│   ├── styles/
│   └── utils/
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 功能截图占位

### 简历列表

> 待补充截图：多版本简历卡片、JSON 导入导出、新建入口。

### 简历编辑器

> 待补充截图：模块拖拽排序、结构化编辑、实时预览三栏布局。

### 模板选择

> 待补充截图：6 套模板缩略图和右侧实时预览。

### PDF 导出预览

> 待补充截图：A4 比例预览和导出设置面板。

## License

MIT

