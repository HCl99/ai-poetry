# 首屏性能基线（Lighthouse）

测量对象：`http://localhost:3001/login`（生产构建 `npm run build && npx next start -p 3001`）。
测量工具：Lighthouse 12.2.1，Chromium 1243 headless，**移动端默认节流**（4× CPU、RTT 150 ms、下行 1.6 Mbps）。
原始报告：[evidence/lighthouse-login-mobile.json](evidence/lighthouse-login-mobile.json)。

## 结论

| 指标 | 优化前 | 优化后（3 轮中位数） |
| --- | --- | --- |
| Performance | 55 | **66** |
| Accessibility | 92 | **100** |
| Best Practices | 96 | 96 |
| SEO | 100 | 100 |
| FCP | 12.0 s | **0.9 s** |
| LCP | 12.2 s | **3.0 s** |
| CLS | 0.019 | 0.017 |
| 总传输量 | 2,696 KiB | **312 KiB** |
| Speed Index | 12.0 s | 3.0 s |

## 逐轮数据

| 轮次 | Performance | A11y | FCP | LCP | TBT | CLS | 传输量 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 65 | 100 | 0.9 s | 3.0 s | 1,980 ms | 0 | 312 KiB |
| 2 | 66 | 100 | 0.9 s | 3.0 s | 2,450 ms | 0.017 | 312 KiB |
| 3 | 69 | 100 | 0.9 s | 2.7 s | 1,730 ms | 0.017 | 312 KiB |

> TBT 口径说明：同一构建的另外几轮曾测到 0 ms / 20 ms；本机 headless 环境下会出现约 1.9 s 的 `Unattributable` 长任务（Lighthouse 归不到任何脚本 URL），属测量环境噪声，已在 README 9.4 注明，不作为项目结论。

## 本轮改动

1. **字体（主要收益）**
   - 移除 `fonts.googleapis.cn` 的 `css2` 阻塞请求与 Noto Serif SC 网络字体（约 1.5 MB，含大量 woff2 分片）。
   - 正文改用系统宋体栈：`Source Han Serif SC → Noto Serif SC → Songti SC → STSong → SimSun`（本地已装则直接用，零网络成本）。
   - 毛笔标题体 `Ma Shan Zheng` 自托管 + fonttools 按界面用字子集化为 `public/fonts/brush-ui.woff2`（5.8 MB → 158 KB），并用 `unicode-range` 与字表严格对齐；未收录字回退楷体。
2. **可访问性**（92 → 100）
   - `.text-muted-blue` 由硬编码 `#7B8EA1`（3.17:1）改为主题变量 `var(--muted-blue)`（`#5B6E7E`）。
   - 登录/注册小字由 `text-ink-soft/80`（3.44:1）改为 `text-ink-soft`。
   - `Typewriter` 打字机文案的 `aria-label` 移到 `role="img"` 元素上，消除 `aria-prohibited-attr`。

## 仍存在的性能风险

- **LCP 3.0 s**：LCP 元素是毛笔体标题，仍需下载 158 KB 字体（`font-display: swap`，内容不阻塞）。若要进一步压缩，只能把标题字再裁剪，代价是更多字回退楷体。
- **检索冷启动**：`search_poems` 首次调用需加载 34.4 万条向量的索引，实测约 9.1 s（后续命中 5 分钟缓存）。演示前先执行一次检索预热，或提前启动服务让 `[vectorStore] cache loaded` 完成。

## 复现

```powershell
npm run build
npx next start -p 3001
$env:CHROME_PATH="$env:USERPROFILE\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
npx lighthouse@12.2.1 http://localhost:3001/login --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=docs/evidence/lighthouse-login-mobile.json
```
