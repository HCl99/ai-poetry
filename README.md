# 墨韵诗心 · AI 古诗词文化探索平台

> 融合大语言模型与知识库检索增强的 AI 古诗词 Web 应用：诗词探索、智能注解、诗人风格迁移、意象图谱一站式体验。
>
> `Next.js 14` · `TypeScript` · `Tailwind CSS` · `Prisma` · `MySQL` · `NextAuth v5` · `智谱 GLM-4-Flash` · `SSE 流式生成`

---

## 一、项目简介

「墨韵诗心」面向古典诗词学习与创作场景，以现代前端框架为主体、Next.js API Routes 作为 AI 能力接入层，提供：

- **AI 智能注解**：对任意一首诗输出「字词释义 / 典故溯源 / 情感分析 / 格律分析」四维度注解；检索采用**两级架构**：本地 **BGE-small-zh 向量模型**（512 维）粗排 top20，再由 **BGE-reranker CrossEncoder** 精排 top5，连同**诗人小传**一起作为上下文；正文中引用的检索诗篇自动高亮归因，每张卡片标注真实引用出处与相似度，做到言之有据。
- **诗人风格迁移**：输入一段现代文，AI 提炼意象、匹配诗人语言风格，逐句生成李白体 / 苏轼体 / 婉约体 / 王维体 / 杜甫体古诗词。
- **SSE 流式体验**：注解与创作均为服务端流式输出，前端逐字渲染；注解页实时展示「解析正文 → 语义向量化 → RAG 向量检索 → 匹配小传 → 大模型撰写」的思考过程，生成后可折叠回看。
- **诗词探索与双图谱**：基于约 34 万首唐宋诗词语料的检索、朝代 / 标签筛选；**意象图谱**展示核心意象共现关系，**诗人图谱**基于 12,609 位诗人小传互提关系构建 695 条关联边，可视化诗人间的师承、唱和与影响。
- **个人空间**：NextAuth 邮箱注册登录，收藏、浏览历史、AI 创作、学习笔记持久化。

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

- 约 **5.7 万首**唐诗语料、**366 篇**精校赏析、**30 个**核心意象、**200+** 意象共现关联、**数千位**诗人小传。
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
python scripts/import_to_mysql.py       # 建语料表并灌入约 34 万首诗词
python scripts/create_users_table.py    # 建 users 鉴权表
python scripts/create_user_tables.py    # 建收藏/历史/创作/笔记表
python scripts/migrate_chunks_vector.py # chunks 向量表迁移
npx prisma generate

# 5. 生成语义向量（本地 BGE 模型，约 17 万首核心语料，可中断续跑）
python scripts/gen_embeddings.py

# 6. 启动向量微服务（供查询时向量化，端口 8100）
python scripts/embed_server.py

# 7. 启动开发服务器
npm run dev            # http://localhost:3000
```

> **语料路径说明**：`scripts/import_to_mysql.py` 顶部的 `TANG_DIR` 默认指向与项目同级的 `chinese-poetry-master/全唐诗` 目录。请先克隆 chinese-poetry 仓库到项目同级目录，或按需修改该变量。

### 部署（生产）

```bash
npm run build && npm run start   # Next.js 生产服务（端口 3000）
```

向量微服务需常驻，与 Next.js 同机部署：

```bash
# 方式一：pm2 托管两个进程（推荐）
pm2 start "python scripts/embed_server.py" --name embed-server
pm2 start "npm run start" --name ai-poetry
pm2 save

# 方式二：systemd / nohup 各自常驻亦可
nohup python scripts/embed_server.py > embed.log 2>&1 &
```

> 向量服务不可用时应用可自动降级为意象共现检索（可用性优先），但演示完整 RAG 能力前请确认 8100 端口健康：`curl http://127.0.0.1:8100/health`。
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
| `AUTH_URL` / `AUTH_TRUST_HOST` | 应用地址与托管信任开关 |

真实密钥仅放在 `.env`（已在 `.gitignore` 中忽略），仓库只提供 `.env.example` 模板。

## 七、评审测试账号

| 账号 | 密码 | 说明 |
| --- | --- | --- |
| `test@poetry.ai` | `test123456` | 评审专用，含示例收藏 / 历史 / 创作数据 |

也可在登录页自行注册新账号。

## 八、AI 实现说明

- **模型接入**：通过 OpenAI 兼容 SDK 接入智谱 `glm-4-flash`，针对注解（结构化、低温）与创作（高发散、高温）使用不同 Prompt 模板与采样参数。
- **向量语义检索（RAG）**：本地部署 `BAAI/bge-small-zh-v1.5` 中文向量模型（512 维，私有化无外部依赖），将 16.7 万首"有可考诗人小传"的诗词离线编码入库（`chunks` 表）；查询时经 `scripts/embed_server.py` 微服务向量化，在内存向量库（`lib/vectorStore.ts`）中做全量余弦 topK 检索（17 万 × 512 维，百毫秒级）。注解检索相似诗篇、风格迁移检索该诗人的语义相近范例作为 few-shot 上下文；向量服务不可用时自动降级为意象共现检索，保证可用性。
- **两级检索（粗排+精排）**：注解生成前，先用本地 `BAAI/bge-small-zh-v1.5` 向量做 top20 粗排，再经 `BAAI/bge-reranker-base` CrossEncoder 精排 top5；风格迁移检索该诗人的语义相近范例作为 few-shot 上下文。reranker 不可用时自动降级为粗排结果，可用性优先。
- **引用归因**：生成时提示模型以《诗题》标注引用来源，前端将正文中命中检索结果的《诗题》渲染为高亮归因标记；实验脚本统计"命中检索 / 库内真实 / 幻觉"三类引用，输出幻觉率对比。
- **检索效果实测（A/B 对照）**：`scripts/rag_ab_test.py` 以"同提示词、唯一变量为检索上下文"做盲评对照（GLM-4-Flash 评分，10 样本 × 有/无检索）。结论：RAG 组整体质量 7.2 vs 无检索 6.6（胜负 7/1/2），随机组 +0.8、冷门诗人组 +0.4，引用密度提升 3 倍；同时诚实呈现引用标注要求带来的 2 次过度引用幻觉及改进方向。完整报告见 [docs/rag_ab_report.md](docs/rag_ab_report.md)。
- **流式输出**：两个 AI 接口均使用 `stream: true` + SSE 转发，前端通过统一的 `lib/sse.ts` 异步迭代器解析半包 / 粘包；注解按 `【小节】` 标记由 `lib/sections.ts` 在流式中途与结束后做一致解析，结束时以后端权威结果校正。
- **可控性与兜底**：登录鉴权、参数校验、JSON / 分节解析容错、异常统一回传错误事件、前端错误边界与重试。

## 九、工程化

- 全量 TypeScript，`tsc --noEmit` 零类型错误；组件分层、Server Components 与 Client Components 职责清晰。
- 环境变量模板、密钥忽略、参数校验与异常兜底齐备。
- 使用 ESLint / Prettier 风格约束，保留完整 Git 提交历史。

## 十、后续规划（Roadmap，尚未实现）

以下为明确的技术演进方向，**当前版本尚未包含**，避免与现状混淆：

1. **AI Agent + Function Calling**：可自主调用生平检索、格律校验、注音、配图等工具的"诗词导师"，并展示规划与工具调用链。
2. **多模态**：文生图水墨意境配图、Web Speech 语音朗诵。
3. **MCP 工具化**：将诗词检索能力封装为 MCP Server，供外部 Agent 调用。
4. **真格律引擎 + 端侧推理**：离线平仄 / 押韵校验、Transformers.js 端侧智能等。
5. **向量索引升级**：向量规模扩大后引入 HNSW 近似最近邻索引（如 pgvector / Milvus），并做"有 / 无检索"的注解质量对比评估。

## 十一、团队信息

> 请参赛同学在提交前补充。

| 角色 | 姓名 | 学校 / 专业 | 分工 |
| --- | --- | --- | --- |
| 队长 |  |  |  |
| 队员 |  |  |  |
| 指导老师 |  |  |  |

## 十二、许可与致谢

- 项目代码遵循团队指定开源协议；诗词语料来自公有领域开源项目 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，特此致谢。
- AI 生成内容仅供学习参考。
