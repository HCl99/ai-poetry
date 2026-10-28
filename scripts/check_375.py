# -*- coding: utf-8 -*-
"""375px 移动端逐页走查：检测横向溢出并截图存档到 docs/screenshots/mobile/
用法：python scripts/check_375.py          # 走查 + 报告 + 截图
"""
import asyncio, json, os
from playwright.async_api import async_playwright

BASE = 'http://localhost:3000'
# (路径, 是否需要登录)
PAGES = [
    ('/login', False),
    ('/register', False),
    ('/home', True),
    ('/workbench', True),
    ('/workbench/explore', True),
    ('/workbench/annotate', True),
    ('/workbench/transfer', True),
    ('/workbench/vision', True),
    ('/workbench/assistant', True),
    ('/workbench/stats', True),
    ('/workbench/graph', True),
    ('/workbench/imagery', True),
    ('/workbench/imagery-timeline', True),
    ('/workbench/feihua', True),
    ('/workbench/quiz', True),
    ('/workbench/recite', True),
    ('/workbench/poet-chat', True),
    ('/workbench/compare', True),
    ('/workbench/community', True),
    ('/workbench/rag-eval', True),
    ('/workbench/mcp', True),
]
OUT = os.path.join('docs', 'screenshots', 'mobile')


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 375, 'height': 812})
        pg = await ctx.new_page()
        # 先建立 origin 并写入「新手引导已完成」，避免截图被引导浮层压暗
        await pg.goto(f'{BASE}/login', wait_until='domcontentloaded')
        await pg.evaluate("() => localStorage.setItem('onboarding-done', '1')")
        # NextAuth 凭证登录（CSRF + callback）
        r = await ctx.request.get(f'{BASE}/api/auth/csrf')
        csrf = (await r.json())['csrfToken']
        resp = await ctx.request.post(
            f'{BASE}/api/auth/callback/credentials',
            form={'email': 'test@poetry.ai', 'password': 'test123456',
                  'csrfToken': csrf, 'callbackUrl': f'{BASE}/home', 'json': 'true'})
        assert resp.status in (200, 302), f'login failed: {resp.status}'

        report = []
        for path, need_auth in PAGES:
            await pg.goto(f'{BASE}{path}', wait_until='networkidle')
            await pg.wait_for_timeout(900)
            m = await pg.evaluate("""() => ({
                scrollW: document.documentElement.scrollWidth,
                clientW: document.documentElement.clientWidth,
            })""")
            overflow = m['scrollW'] > m['clientW'] + 1
            # 定位溢出处：找出超出视口宽度的前几个元素
            culprits = []
            if overflow:
                culprits = await pg.evaluate("""() => {
                    const w = document.documentElement.clientWidth;
                    const out = [];
                    for (const el of document.querySelectorAll('*')) {
                        const r = el.getBoundingClientRect();
                        if (r.width > w + 1 || r.right > w + 1) {
                            const tag = el.tagName.toLowerCase();
                            const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 60);
                            out.push(`${tag}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
                            if (out.length >= 5) break;
                        }
                    }
                    return out;
                }""")
            name = path.strip('/').replace('/', '_') or 'login'
            await pg.screenshot(path=os.path.join(OUT, f'{name}.png'), full_page=False)
            report.append({'page': path, **m, 'h_overflow': overflow, 'culprits': culprits})
        print(json.dumps(report, ensure_ascii=False, indent=1))
        await b.close()

asyncio.run(main())
