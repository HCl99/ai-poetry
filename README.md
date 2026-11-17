# 墨韵诗心 · AI 古诗词文化探索平台

> 融合大语言模型与知识库检索增强的 AI 古诗词 Web 应用：诗词探索、智能注解、诗人风格迁移、意象图谱一站式体验。
>
> `Next.js 14` · `TypeScript` · `Tailwind CSS` · `Prisma` · `MySQL` · `NextAuth v5` · `智谱 GLM-4-Flash` · `SSE 流式生成`

---

## 一、项目简介

「墨韵诗心」面向古典诗词学习与创作场景，以现代前端框架为主体、Next.js API Routes 作为 AI 能力接入层，提供：

- **AI 智能注解**：对任意一首诗输出「字词释义 / 典故溯源 / 情感分析 / 格律分析」四维度注解；检索采用**混合检索 + 精排两级架构**：本地 **BGE-small-zh 向量模型**（512 维）与关键词子串评分按 0.7/0.3 加权融合粗排 top20（强化人名/地名等专有名词召回），再由 **BGE-reranker CrossEncoder** 精排 top5，连同**诗人小传**一起作为上下文；生成受**引用硬约束**（仅允许引用检索列表中的诗篇），正文中引用的检索诗篇自动高亮归因，每张卡片标注真实引用出处与相似度，做到言之有据。
- **诗人风格迁移**：输入一段现代文，AI 提炼意象、匹配诗人语言风格，逐句生成李白体 / 苏轼体 / 婉约体 / 王维体 / 杜甫体古诗词；生成后经自研**格律后校验器**按中华新韵自动校验押韵与平仄（一三五不论、首句入韵宽容），不合格自动反馈重写，界面展示格律校验标记；可一键生成 **CogView-3 水墨意境图**。
- **SSE 流式体验**：注解与创作均为服务端流式输出，前端逐字渲染；注解页实时展示「解析正文 → 语义向量化 → 混合检索 → 匹配小传 → 大模型撰写」的思考过程，生成后可折叠回看。
- **多模态与导出（文生图 + 图像理解 + 语音合成/识别）**：风格迁移可一键生成 **CogView-3 水墨意境图**；**以图搜诗**上传风景 / 绘画照片，由 **GLM-4V** 识别画面意象并反查 34.4 万首诗词中意境相近的篇章，结果页展示「识别意象 → 库内反查 → 命中排序依据」的三段可解释推理链；注解分维度 / 创作整首 **Web Speech 语音朗读**，背诵闯关支持**语音识别**；注解与创作均可**一键导出带引用出处的 Word（.docx）报告**，文档库按需动态加载。
- **诗词探索与双图谱**：基于 34.4 万首中国古典诗词语料的检索、朝代 / 标签筛选；**意象图谱**展示核心意象共现关系，**诗人图谱**基于 12,609 位诗人小传互提关系构建 695 条关联边，可视化诗人间的师承、唱和与影响。
- **个人空间**：NextAuth 邮箱注册登录，收藏、浏览历史、AI 创作、学习笔记持久化。
- **研习周报**：按自然周聚合收藏、浏览、注解、背诵与创作记录，输出本周研习诗篇数、四维注解完成率、背诵正确率、意象偏好分布；并基于本周真实数据生成一首「本周诗笺」，经文末自研**格律后校验器**复核后展示校验结果。所有指标均由库表现场计算，不使用演示假数据。

## 二、技术架构

```
┌──────────────────────────────────────────────────────────┐
│                    浏览器（前端主体）                       │
│   Next.js App Router · React 18 · TypeScript · Tailwind   │
│         SSE 逐字渲染 · AI 思考过程可视化 · 水墨 UI           │
└───────────────────────────────┬──────────────────────────┘
                                 │  SSE (text/event-stream)
                                 ▼
┌──────────────────────────────────────────────────────────┐
│              Next.js API Routes（AI 接入层）               │
│  NextAuth 鉴权 · 参数校验 · RAG 检索编排 · Prompt 构建      │
│  /api/annotation  /api/transfer  /api/poems  /api/user/*  │
└─────┬────────────────┬───────────────────────┬───────────┘
      │ chat.completions(stream) │ /embed      │ Prisma ORM
      ▼                        ▼               ▼
 智谱 GLM-4-Flash      本地 BGE 向量服务   ┌──────────────────┐
 （流式大语言模型）     bge-small-zh-v1.5  │      MySQL       │
                       (embed_server.py)  │ 诗库·注解·意象库  │
                                          │ 小传·向量·用户表  │
                                          └──────────────────┘
```

**设计取向**：遵循赛事"以前端 Web 为主体、后端仅作 AI 接入层"的导向，业务编排放在 Next.js API Routes，不引入独立后端服务。

## 三、目录结构

```
ai-poetry/
├── app/
│   ├── api/                # API Routes（AI 接入层）
│   │   ├── annotation/     # AI 注解：SSE 流式 + 知识检索编排
│   │   ├── transfer/       # 风格迁移：SSE 流式
│   │   ├── poems/list/     # 诗词检索
│   │   ├── auth/           # NextAuth 登录态
│   │   └── user/           # 收藏 / 历史 / 创作 / 笔记 / 汇总
│   ├── workbench/          # 工作台：探索 / 注解 / 迁移 / 意象
│   ├── login/ register/    # 登录注册（Server Actions）
│   └── page.tsx            # 落地页
├── components/             # 组件（ui 基础组件 + workbench 业务视图）
├── lib/
│   ├── sse.ts              # SSE 服务端编码 + 客户端解码（两端复用）
│   ├── sections.ts         # 四维度注解分节解析（流式/终态一致）
│   └── prisma.ts           # Prisma Client 单例
├── prisma/schema.prisma    # 数据模型
├── mysql/schema.sql        # 语料库建表 DDL
├── data/                   # 意象、赏析等本地数据
├── scripts/                # 语料导入 / 回填 / 端到端测试脚本
└── .env.example            # 环境变量模板
```

## 四、数据规模与来源

- **34.4 万首**全库诗词、**366 篇**精校赏析、**50 个**核心意象、**1,200+** 意象共现关联（图谱页展示权重前 200 条）、**12,609 位**诗人小传。
- 语料来自开源项目 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（公有领域数据），经繁简转换、清洗、结构化后入库；诗词版权归公有领域。

## 五、快速开始

### 环境要求

- Node.js **≥ 18.18**、npm（或 pnpm）
- MySQL **8.x**
- Python **3.9+**（仅一次性导入语料时使用，依赖 `pymysql`、`opencc`）
- 智谱 AI API Key（可在 [智谱开放平台](https://open.bigmodel.cn/) 免费申请）

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env      # Windows: copy .env.example .env
#   填写 MySQL 连接与 ZHIPUAI_API_KEY

# 3. 创建数据库
mysql -u root -p -e "CREATE DATABASE ai_poetry DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. 导入语料与建表（一次性）
pip install pymysql opencc sentence-transformers flask
python scripts/import_to_mysql.py       # 建语料表并灌入唐诗主体（其余语料由 import_corpus.py 补全，合计 34.4 万首）
python scripts/create_users_table.py    # 建 users 鉴权表
python scripts/create_user_tables.py    # 建收藏/历史/创作/笔记表
python scripts/migrate_chunks_vector.py # chunks 向量表迁移
npx prisma generate

# 5. 生成语义向量（本地 BGE 模型，34.4 万首全库语料，可中断续跑）
python scripts/gen_embeddings.py

# 6. 启动向量微服务（供查询时向量化，端口 8100）
python scripts/embed_server.py

# 7. 启动开发服务器（Windows 可用一键脚本，自动检查并按需拉起 8100 向量服务）
npm run dev                        # http://localhost:3000
# 或：scripts\start_all.bat
```

> **语料路径说明**：`scripts/import_to_mysql.py` 顶部的 `TANG_DIR` 默认指向与项目同级的 `chinese-poetry-master/全唐诗` 目录。请先克隆 chinese-poetry 仓库到项目同级目录，或按需修改该变量。

### 部署（生产）

```bash
npm run build && npm run start   # Next.js 生产服务（端口 3000）
```

### 分享给他人运行（免重新导入数据）

项目已内置一键打包与恢复脚本，对方电脑无需重新导入 34 万首诗词。

**你这边（打包）**：

```bash
# 1. 先导出数据库到 data/ai_poetry.sql
mysqldump -u root -p ai_poetry > data/ai_poetry.sql

# 2. 打包（自动排除 node_modules/.next/.git，保留 .env 和数据库）
pack.bat
# 产物：../墨韵诗心.zip
```

**对方电脑（恢复 + 运行）**：

1. 解压 `墨韵诗心.zip` 到任意目录
2. 确保已安装：Node.js ≥ 18、MySQL 8、Python 3.10+
3. 双击 `setup.bat`（自动建库 + 导入数据 + npm 依赖 + Prisma + Python 依赖）
4. 运行 `python run.py` 启动，浏览器访问 http://127.0.0.1:3000

> 压缩包内含：完整源码、`.env`（含 API Key）、`data/ai_poetry.sql`（诗词数据）、`data/vectors.bin`（向量缓存，免重新生成）。
>
> **Python 依赖**：`setup.bat` 会自动执行 `pip install -r requirements.txt`（flask / sentence-transformers / faster-whisper / edge-tts）。首次启动三个本地微服务时会自动下载模型，共约 1.7GB，需联网；之后可完全离线。在纯 CPU 机器上建议先单独装 torch，避免拉到约 2GB 的 CUDA 版本：
>
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cpu
> pip install -r requirements.txt
> ```
>
> **没有 Python 也能跑**：`run.py` 会自动跳过缺少依赖的微服务，系统降级为关键词检索，主站与云模型功能不受影响。若确定不使用本地服务，可在 `.env` 里设 `EMBED_SERVER_URL=off`，彻底不走向量检索。

向量微服务需常驻，与 Next.js 同机部署：

```bash
# 方式一：pm2 托管两个进程（推荐）
pm2 start "python scripts/embed_server.py" --name embed-server
pm2 start "npm run start" --name ai-poetry
pm2 save

# 方式二：systemd / nohup 各自常驻亦可
nohup python scripts/embed_server.py > embed.log 2>&1 &
```

> **降级策略**：向量服务不可用时，AI 注解 / AI 助手自动降级为关键词检索，界面会明确展示「向量服务不可用，已降级」的过程提示，功能不中断（可用性优先）。演示完整 RAG 能力（混合粗排 + CrossEncoder 精排）前请确认 8100 端口健康：`curl http://127.0.0.1:8100/health`（返回含 `"reranker":true` 表示精排模型已随服务启动预加载；如需更快启动可跳过精排，调用方会自动降级为粗排结果）。
> 本地开发可用 `scripts\start_all.bat`（Windows）一键启动向量服务 + dev server。

## 六、环境变量

| 变量 | 说明 |
| --- | --- |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | MySQL 连接（供 Python 导入脚本读取） |
| `DATABASE_URL` | Prisma 连接串，密码中 `@` 需编码为 `%40` |
| `ZHIPUAI_API_KEY` | 智谱 AI API Key（**切勿提交真实密钥**） |
| `ZHIPUAI_BASE_URL` | 智谱 API 地址，默认 `https://open.bigmodel.cn/api/paas/v4` |
| `EMBED_SERVER_URL` | 本地 BGE 向量服务地址，默认 `http://127.0.0.1:8100` |
| `AUTH_SECRET` | NextAuth 密钥，生产用 `openssl rand -base64 32` 生成 |
| `SMTP_HOST` / `SMTP_PORT` | QQ 邮箱 SMTP 服务器，默认 `smtp.qq.com:465`（SSL） |
| `SMTP_USER` / `SMTP_PASS` | QQ 邮箱地址与 **SMTP 授权码**（在 QQ 邮箱设置中生成，不是登录密码）；用于注册验证码与找回密码 |
| `MCP_API_KEY` | （可选）MCP Server 外部访问密钥；配置后 Claude Desktop 等外部 Agent 可通过 `Authorization: Bearer` 直连 `/api/mcp` |
| `AUTH_URL` / `AUTH_TRUST_HOST` | 应用地址与托管信任开关 |

真实密钥仅放在 `.env`（已在 `.gitignore` 中忽略），仓库只提供 `.env.example` 模板。

### 邮箱验证码与找回密码

注册需先获取邮箱验证码（6 位、10 分钟有效、一次性使用），忘记密码通过同一套验证码重置。验证码只存 bcrypt 哈希，同一邮箱 60 秒冷却、每小时最多 5 封；找回密码对未注册邮箱不返回差异化信息，避免账号枚举。

SMTP 配置：QQ 邮箱 → 设置 → 账号 → 开启 SMTP 服务 → 生成**授权码**（不是登录密码），填入 `SMTP_USER`（邮箱地址）与 `SMTP_PASS`（授权码）。

> **未配置 SMTP 时**：注册页点「获取验证码」会明确提示「邮件服务未配置，请联系管理员」，不会静默失败；演示可直接使用预置测试账号，或在管理后台创建用户。修改密码后旧 JWT 会话立即失效（`passwordChangedAt` 校验），其余设备需重新登录。

## 七、评审测试账号与角色权限

登录页「账号」一栏支持**邮箱或用户名**两种写法（用户名由注册时的邮箱前缀自动生成）。系统区分**普通用户**与**管理员**两类角色，请切换账号分别评审。

| 角色 | 账号（邮箱 / 用户名） | 密码 | 用途 |
| --- | --- | --- | --- |
| 普通用户 `user` | `test@poetry.ai` / `test` | `test123456` | 含示例收藏 / 历史 / 创作数据，体验全部 AI 与学习功能 |
| 管理员 `admin` | `admin@poetry.ai` / `admin` | `admin123` | 可进入 `/admin` 管理后台，验证 RBAC 与内容治理能力 |

> 上述两个账号预置在本地 `data/ai_poetry.sql`（约 1.8 GB，仅供本地打包分发，**不纳入代码仓库**）。从 GitHub 克隆的评审环境请按第五节「安装与运行」初始化空库，然后：
> 1. 在登录页直接注册新账号，即可体验全部 AI 与学习功能（新账号角色默认为 `user`）；
> 2. 需要评审管理后台时，注册后执行 `UPDATE users SET role='admin' WHERE email='<你的注册邮箱>';`，**重新登录**后即可访问 `/admin`；
> 3. 仓库不含全量语料与向量缓存，首次启动请按第五节第 4–6 步生成，AI 检索能力依赖该数据。
>
> 演示口令仅用于本地演示环境，请勿用于生产部署。

### 7.1 角色与权限边界

| 能力 | 普通用户 | 管理员 |
| --- | :---: | :---: |
| AI 智能注解 / 双模型对比 / 风格迁移 / 意象图谱 / GraphRAG 问答 / AI 助手 / MCP 面板 | ✓ | ✓ |
| 诗词探索、收藏、笔记、我的创作、社区发帖、自测、飞花令、背诵闯关、研习周报 | ✓ | ✓ |
| 侧边栏「管理后台」入口 | 隐藏 | 显示 |
| 数据总览、用户管理、诗词管理、分类管理、帖子审核、反馈处理（`/admin/*`） | 重定向回 `/workbench` | ✓ |
| 全部 `/api/admin/*` 接口（统计 / 用户 / 用户详情 / 诗词 / 帖子 / 反馈 / 分类 / 帖子分类） | 403 | ✓ |
| 禁用账号、增删改诗词与分类、审核与删除社区帖子、处理用户反馈 | ✗ | ✓ |

**三层校验，前端隐藏不等于后端放行**：

1. **页面级**：`app/admin/layout.tsx` 在服务端读取会话，`role !== 'admin'` 直接 `redirect('/workbench')`，未登录或 `disabled` 重定向 `/login`。
2. **接口级**：全部 `/api/admin/*` 路由（含新增的 `/api/admin/post-categories`、`/api/admin/post-logs` 与 `/api/admin/users/[id]`）逐一调用 `lib/admin.ts` 的 `requireAdmin()`，非管理员返回 403；直接请求 API 无法绕过页面守卫。
3. **会话级**：`auth.ts` 的 `jwt` 回调实时查库写入 `role` / `status`，账号被禁用后旧会话立即降级为 `disabled`；`passwordChangedAt` 校验使改密后的旧 JWT 失效。

`components/workbench/shell.tsx` 按 `user.role === 'admin'` 条件渲染后台入口，普通用户界面不出现管理入口——这是 UI 层的角色区分，真正的权限边界在上述服务端两层。另需说明：`middleware.ts` 的 matcher 覆盖 `/workbench` 与 `/profile`，`/admin` 由布局守卫承担，两条路径互不依赖。

### 7.2 内容审核闭环：先审后发、实时同步、作者撤回

学习社区采用「普通用户发帖 → 管理员审批 → 通过后自动发布」的闭环，作者全程保留撤回权。状态机集中在 `lib/postWorkflow.ts`（前后端共享纯函数，配套单测 `lib/__tests__/postWorkflow.test.ts`）：

| 状态 | 可见范围 | 触发条件 | 作者还能做什么 |
| --- | --- | --- | --- |
| 待审核 `pending` | 作者 + 管理员 | 普通用户发帖；任意账号命中敏感词 | 撤回申请 |
| 已通过 `approved` | 全体社区成员 | 管理员通过 / 管理员发布（免审） | 撤回帖子 |
| 未通过 `rejected` | 作者 + 管理员 | 管理员拒绝（备注回显给作者） | 撤回投稿 |
| 已撤回 `withdrawn` | 作者 + 管理员 | 作者撤回 | 终态，仅管理员可删除记录 |

- **角色差异**：管理员发布正常内容直接 `approved`，命中敏感词仍强制送审；普通用户一律先审后发。
- **实时同步**：两端页面用 `hooks/useAutoRefresh.ts` 在标签页可见时每 5 秒（数据总览 10 秒）拉取 `no-store` 数据，切回标签页立即补同步。用户端比对状态快照，审批通过/拒绝时主动弹出提示；管理员端待审队列、总览数字与「已撤回」分栏自动刷新。
- **撤回优先**：`PUT /api/posts/[id]` 先做 `user_id` 归属校验，再以条件更新落库；管理员审批同样以 `status != 'withdrawn'` 为更新条件。两端并发时先落库者生效，**已撤回的帖子不会被管理员重新审批放出**。
- **可当场验证**：普通账号发帖 → 卡片显示「管理员审批中 · 仅自己可见」→ 换管理员账号在 `/admin/posts` 看到待审队列 → 点「通过」→ 切回普通账号（或原地最多等 5 秒）看到「已通过审核 · 社区可见」并收到提示 → 点「撤回帖子」→ 管理员端该帖变为「已撤回」且审批按钮消失。
- **审核记录（操作历史）**：`post_review_logs` 表记录「提交投稿 / 审核通过 / 审核拒绝 / 作者撤回 / 删除记录」五类动作，每条含前后状态、操作人、角色、审核备注与时间戳。`/admin/posts` 第五个分栏「操作历史」按时间倒序分页展示，同样 5 秒轮询；点开帖子标题，详情弹窗内还有该帖的单独时间线。日志表**不设外键**且冗余保存标题与操作人名，帖子被删除后历史仍可追溯。
- **免迁移**：日志表由 `lib/postReviewLog.ts` 在首次读写时用 `CREATE TABLE IF NOT EXISTS` 幂等补建，评审环境只导入既有 `ai_poetry.sql` 也能跑通（分类配置同理，见 7.3）；`scripts/post_review_logs_migration.sql` 仅供 DBA 预先建表参考。写日志失败只记服务端错误，不阻断发帖 / 审批主流程。

> **演示建议**：先用 `test` 账号走完「AI 注解 → 引用高亮 → 风格迁移 → 格律徽章」主线；再用 `test` 发一帖、切换 `admin` 账号在 `/admin/posts` 通过（约 20 秒，可同时演示撤回）；最后展示数据总览与角色权限。两个视角分别对应「学习者」与「平台运营者」，也便于现场验证普通账号无法越权访问管理接口。
>
> **审核台演示数据**：`python scripts/seed_post_review_demo.py` 用 `test` / `admin` 两个真实账号走一遍发帖 → 通过 / 拒绝 / 撤回，让待审核、已通过、已拒绝、已撤回四个分栏与操作历史都有内容；脚本按真实业务接口调用，**不是直接 INSERT 的占位行**，且各步之间留有时序间隔。交付前可用 `node scripts/clean_post_review_demo.mjs` 按标题精确清理这批帖子与对应审核记录，不影响真实用户数据。

### 7.3 管理后台：从展示到可操作

管理端六个页面里的数字与卡片都对应真实数据，且都能在页面上直接操作，不是静态占位：

| 模块 | 可操作动作 | 数据落点 / 同步方式 |
| --- | --- | --- |
| 数据总览 | 指标卡跳转对应模块；待审帖子**行内直接通过**；待处理反馈摘要 | `GET /api/admin/stats`，10 秒 `no-store` 轮询 |
| 用户管理 | 角色升降、禁用/启用、点开**用户详情**（投稿/评论/创作/收藏/反馈真实计数 + 最近投稿） | `PUT /api/admin/users`、`GET /api/admin/users/[id]` |
| 诗词管理 | 增删改查，正文/标签编辑 | `poems` 表，注解与意象关联随外键级联 |
| 帖子审核 | 通过 / 拒绝（备注回显作者）/ 删除，四态分栏 + **操作历史**（全局日志与单帖时间线）实时同步 | `GET /api/admin/post-logs`、`post_review_logs` 表；见 7.2 |
| 反馈处理 | 回复、**修改回复**、**重新打开**、删除 | `PUT /api/admin/feedback`；用户端反馈历史 10 秒轮询自动显示回复 |
| 分类管理 | 朝代分布（实时）、意象增删 + **重算关联数**、社区分类**增删改 / 恢复默认** | 见下 |
| 侧边栏 | 待审帖子、待回复反馈的**实时角标**，头部一键退出登录（便于切换双账号） | `GET /api/admin/stats`，10 秒轮询 |

**社区分类是运行时配置，不是写死在代码里的常量**。`data/post-categories.json` 存 `{ id, name, desc }`，服务端经 `lib/postCategories.ts` 读写，文件缺失或损坏时自动回落到内置四项。管理员在 `/admin/categories` 改名时，`PUT /api/admin/post-categories` 会用 `updateMany` 把该分类下的历史帖子一起迁移；删除前先查占用，仍有帖子的分类拒绝删除并提示数量；新增/删除后用户端发帖选项与筛选按钮在 5 秒轮询内自动同步，颜色按名称稳定散列生成，不依赖预设配色。`GET /api/posts` 的分类筛选与 `POST /api/posts` 的分类校验都改为读运行时配置。选文件而非新增数据库表，是为了让评审环境只导入既有 `ai_poetry.sql` 就能跑通，不需要额外迁移。

意象计数用一条相关子查询 `UPDATE` 从 `poem_imagery` 批量重算，避免数千条逐行更新撑爆事务。

> 演示建议（约 30 秒）：管理员在 `/admin/categories` 新增一个分类 → 切到普通账号打开发帖框，等最多 5 秒看到新分类出现 → 管理员把该分类改名 → 用户端选项同步变化。这条链路直观说明「后台配置不是摆设」。

## 八、AI 实现说明

- **模型接入**：通过 OpenAI 兼容 SDK 接入智谱 `glm-4-flash`，针对注解（结构化、低温）与创作（高发散、高温）使用不同 Prompt 模板与采样参数。
- **向量语义检索（RAG）**：本地部署 `BAAI/bge-small-zh-v1.5` 中文向量模型（512 维，私有化无外部依赖），将 **34.4 万首全库诗词**离线编码入库（`chunks` 表）；查询时经 `scripts/embed_server.py` 微服务向量化，在内存向量库（`lib/vectorStore.ts`）中做全量余弦 topK 检索（34 万 × 512 维，百毫秒级）。注解检索相似诗篇、风格迁移检索该诗人的语义相近范例作为 few-shot 上下文；向量服务不可用时自动降级为意象共现检索，保证可用性。
- **两级检索（混合粗排+精排）**：注解生成前，先用本地 `BAAI/bge-small-zh-v1.5` 向量与关键词子串评分（诗题/作者命中查询二元组）按 **0.7 向量 + 0.3 关键词** 加权融合粗排 top20——解决人名/地名等专有名词纯向量匹配弱的问题（实测《黄鹤楼》《庐山》《昭君》类查询检索结果全部命中同地名/同人名诗篇）；再经 `BAAI/bge-reranker-base` CrossEncoder 精排 top5；风格迁移检索该诗人的语义相近范例作为 few-shot 上下文。reranker 不可用时自动降级为粗排结果，可用性优先。
- **引用归因与杜撰引用治理**：生成时施加**引用硬约束**（仅允许引用检索列表中的诗篇，《》内只填诗题），前端将正文中命中检索结果的《诗题》渲染为高亮归因标记；实验脚本按"命中检索 / 库内真实 / 杜撰引用 / 格式违规"四类统计引用并输出杜撰引用占比对比。
- **检索效果实测（A/B 对照 + 闭环迭代）**：`scripts/rag_ab_test.py` 以"同提示词、唯一变量为检索上下文"做盲评对照（GLM-4-Flash 评分，50 首：随机组 25 + 冷门诗人组 25）。最终轮结论：RAG 组引用密度为无检索组 10 倍（32 vs 3 次），**88.5%（115/130）引用直接命中检索结果**，注解场景杜撰引用 2 条（1.5%）。更严格的冷门诗人长尾评测中，RAG 组杜撰篇名率 8.2%、正确归属率 88.5%、诗句可验证率 42.8%（无检索组分别为 31.7% / 0.0% / 0.0%）。引用硬约束离线对照：越界引用 2/16 → 0/16（样本仅 16 条，只覆盖"引用是否越界"一个维度，不外推为整体准确率）。完整过程见 [docs/rag_ab_report.md](docs/rag_ab_report.md) 与 [docs/rag_longtail_report.md](docs/rag_longtail_report.md)。
- **流式输出**：两个 AI 接口均使用 `stream: true` + SSE 转发，前端通过统一的 `lib/sse.ts` 异步迭代器解析半包 / 粘包；注解按 `【小节】` 标记由 `lib/sections.ts` 在流式中途与结束后做一致解析，结束时以后端权威结果校正。
- **可控性与兜底**：登录鉴权、参数校验、JSON / 分节解析容错、异常统一回传错误事件、前端错误边界与重试。
- **内容安全：输入/输出双向过滤 + 违规兜底**：服务端统一词库（不暴露到 UI），对 prompt injection / 越狱、色情低俗、血腥暴力、仇恨歧视、违法交易等明确语境做输入拦截（返回 400）；流式生成中按最近 2000 字滚动校验，命中即中断并回传安全提示，兼顾古诗词中「杀人」「血」「死」「酒」「妓」等正常字词不误杀。

## 九、工程化（可复现证据）

### 9.1 类型与测试

- 全量 TypeScript，`npx tsc --noEmit` 零类型错误；Server Components 与 Client Components 职责分离。
- Vitest 单测：**6 个测试文件、55 个用例全部通过**（`npm test`），覆盖核心纯逻辑；以 CI 结果为准，Windows 本地偶发临时目录权限导致个别文件未收集。

| 测试文件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `lib/__tests__/meter.test.ts` | 21 | 格律校验：平仄、押韵、一三五不论、首句入韵宽容 |
| `lib/sections.test.ts` | 13 | 四维注解分节解析（流式中间态与终态一致） |
| `lib/citationCheck.test.ts` | 7 | 引用越界校验、归因判定 |
| `lib/sse.test.ts` | 5 | SSE 编码、跨 chunk 半包、`\r\n` 兼容、非 JSON 帧容错 |
| `lib/rateLimit.test.ts` | 5 | 限流计数与窗口重置 |
| `lib/daily.test.ts` | 4 | 每日一诗按日期取模的稳定性 |

### 9.2 持续集成

`.github/workflows/ci.yml` 在每次 push / PR 时依次执行：MySQL 8 service 起库 → `prisma generate` → `prisma db push` → `tsc --noEmit` → `npm test` → `npm run build`，任一步失败即红灯。构建使用 dummy 环境变量，不依赖真实模型密钥。

### 9.3 构建体积（`next build`，2026-11 实测）

- 全站共享 chunk **87.2 kB**（First Load JS shared by all），Middleware 77.2 kB。
- 主要页面 First Load JS：首页 87.3 kB、登录 98.2 kB、工作台注解 102 kB、AI 助手 102 kB、意象图谱 104 kB，全部页面落在 **87–104 kB** 区间。
- 构建清单中 **46 条 API Route** 在客户端均为 0 kB——AI 调用、检索编排、Prisma 访问全部留在服务端。
- 大依赖按需加载：分享卡合成的 `html2canvas`（约 200 kB）通过 `await import('html2canvas')` 动态引入，仅点击「生成分享图」时才下载，不进首屏包。
- 包体构成图：`@next/bundle-analyzer` 生成的静态报告见 [docs/evidence/bundle-client.html](docs/evidence/bundle-client.html)（复现：`$env:ANALYZE='true'; $env:NEXT_DIST_DIR='.next-analyze'; npx next build`，报告输出到 `.next-analyze/analyze/client.html`）。

### 9.4 首屏性能（Lighthouse 12.2.1，移动端默认节流：4× CPU / 1.6 Mbps，生产构建）

| 指标 | 优化后（3 轮中位数） | 优化前（Google Fonts CDN） |
| --- | --- | --- |
| Performance | **66** | 55 |
| Accessibility | **100** | 92 |
| Best Practices / SEO | 96 / 100 | 96 / 100 |
| FCP / LCP | 0.9 s / **3.0 s** | 12.0 s / 12.2 s |
| TBT / CLS | 见下方说明 / 0.017 | 0 ms / 0.019 |
| 总传输量 | **312 KiB** | 2,696 KiB |

原始报告：[docs/evidence/lighthouse-login-mobile.json](docs/evidence/lighthouse-login-mobile.json)；逐轮数据与复现命令见 [docs/performance-baseline.md](docs/performance-baseline.md)。

字体是首屏最大的可优化项：正文改为系统宋体（不再拉取 Noto Serif SC 约 1.5 MB），毛笔标题体用 fonttools 按界面用字裁剪为 `brush-ui.woff2`（158 KB）+ `unicode-range` 白名单，未收录的字自动回退楷体，全程不依赖 Google Fonts。总传输量 2,696 → 312 KiB，FCP 12.0 s → 0.9 s。

> TBT 在该后台 headless 环境不稳定：同一构建不同轮次出现过 0 ms / 20 ms，也出现过约 1.9 s 的 `Unattributable` 长任务（不归属任何脚本 URL），因此不作为本项目结论口径。


> 复现命令：`NEXT_DIST_DIR=.next-build npx next build && NEXT_DIST_DIR=.next-build npx next start -p 3001`，再用 Lighthouse 打开 `http://localhost:3001/login`。

### 9.5 AI 用量与单位成本（真实 usage，非估算）

- 新增 `ai_usage` 表（`prisma/schema.prisma`），在注解、追问、风格迁移、周报诗笺四处读取模型返回的 `usage` 并逐次落库；字段为 feature / model / prompt_tokens / completion_tokens / latency_ms，缺 usage 时不写，避免混入估算值。
- 生产构建实测（2026-11）：四维注解 **1,394 tokens/次**（6 次均值）、注解追问 **924**（3 次）、风格创作 **2,370**（20 首，含格律重写）、本周诗笺 **1,266**（1 首 2 轮）。
- 现用 `glm-4-flash` 输入/输出均为免费档，AI 边际成本为 0；按官方 `glm-4-flashx` 0.1 元/百万 tokens 折算，单次注解约 **¥0.00014**。按免费额度 10 次/日（6 注解 + 3 追问 + 1 创作）估算，单用户 AI 变动成本约 **¥0.041/月**，会员 9.9 元/月下占比约 0.4%（不含服务器与带宽固定成本）。
- 5 种风格 × 4 段现代文的 20 首生成实测：初检格律通过 3/20（15%），4 轮内自动重写后 10/20（50%），押韵维度 12/20；未通过者在界面如实标注「格律有出入」。
- 完整口径、persona 与边界场景证据见 [docs/评审补充材料.md](docs/评审补充材料.md)，原始数据 [docs/evidence/ai-usage-samples.json](docs/evidence/ai-usage-samples.json)。

### 9.6 其他

- 环境变量模板、密钥忽略、参数校验与异常兜底齐备；RAG 相关外部依赖（向量服务 / reranker）不可用时自动降级并在 UI 明示。
- 保留完整 Git 提交历史。

## 十、技术演进方向

当前版本已落地：GraphRAG 工具调用 Agent（`lib/agentTools.ts`，模型自主规划工具并展示调用链）、MCP Server（`/api/mcp`，可接入 Claude Desktop 等外部 Agent）、本地格律校验（`lib/meter.ts`，平水韵/新韵押韵与平仄硬校验）。

后续可扩展方向（不在当前版本内）：

1. **向量索引升级**：向量规模进一步扩大后引入 HNSW 近似最近邻索引（pgvector / Milvus）。
2. **端侧推理**：基于 Transformers.js 的离线注解与朗读，降低对云端 API 的依赖。
3. **多模态统一索引**：将图像意象向量与文本诗篇向量纳入同一索引，提升以图搜诗的召回。

## 十一、团队信息

| 角色 | 姓名 | 学校 / 专业 | 分工 |
| --- | --- | --- | --- |
| 队长 | 隆妍娟 | 湖南人文科技学院 / 计算机科学与技术 | — |
| 队员 | 王文倩 | 湖南人文科技学院 / 计算机科学与技术 | — |
| 队员 | 李佳慧 | 湖南人文科技学院 / 计算机科学与技术 | — |
| 指导老师 | 彭自立 | 湖南人文科技学院 | — |

## 十二、许可与致谢

- 项目代码采用 **MIT License** 开源；诗词语料来自公有领域开源项目 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，特此致谢。
- AI 生成内容仅供学习参考。
