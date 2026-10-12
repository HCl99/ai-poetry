# -*- coding: utf-8 -*-
"""1280px 窄屏 UI 检查：检测横向溢出并截图"""
import asyncio, json
from playwright.async_api import async_playwright

BASE = 'http://localhost:3000'
PAGES = ['/', '/explore', '/annotate', '/transfer', '/imagery', '/graph']
OUT = 'scripts/_shots'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800})
        pg = await ctx.new_page()
        # NextAuth 凭证登录（CSRF + callback）
        r = await ctx.request.get(f'{BASE}/api/auth/csrf')
        csrf = (await r.json())['csrfToken']
        resp = await ctx.request.post(
            f'{BASE}/api/auth/callback/credentials',
            form={'email': 'test@poetry.ai', 'password': 'test123456',
                  'csrfToken': csrf, 'callbackUrl': f'{BASE}/workbench', 'json': 'true'})
        assert resp.status in (200, 302), f'login failed: {resp.status}'
        await pg.goto(f'{BASE}/workbench', wait_until='networkidle')
        assert '/login' not in pg.url, f'session not established, at {pg.url}'
        await pg.wait_for_timeout(1200)

        report = []
        for path in PAGES:
            url = f'{BASE}/workbench{path if path != "/" else ""}'
            await pg.goto(url, wait_until='networkidle')
            await pg.wait_for_timeout(1000)
            m = await pg.evaluate("""() => ({
                scrollW: document.documentElement.scrollWidth,
                clientW: document.documentElement.clientWidth,
                bodyScrollW: document.body.scrollWidth,
            })""")
            overflow = m['scrollW'] > m['clientW'] + 1
            name = path.strip('/').replace('/', '_') or 'dashboard'
            await pg.screenshot(path=f'{OUT}/{name}.png', full_page=False)
            report.append({'page': path, **m, 'h_overflow': overflow})
        print(json.dumps(report, ensure_ascii=False, indent=1))
        await b.close()

asyncio.run(main())
