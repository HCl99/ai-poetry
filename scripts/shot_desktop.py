# -*- coding: utf-8 -*-
"""1440×900 桌面端截图存档到 docs/screenshots/desktop/（参赛材料用，关闭新手引导与动画）
用法：python scripts/shot_desktop.py
"""
import asyncio, os
from playwright.async_api import async_playwright

BASE = 'http://localhost:3000'
PAGES = [
    ('/login', False),
    ('/home', True),
    ('/workbench', True),
    ('/workbench/explore', True),
    ('/workbench/annotate', True),
    ('/workbench/transfer', True),
    ('/workbench/vision', True),
    ('/workbench/assistant', True),
    ('/workbench/imagery', True),
    ('/workbench/graph', True),
    ('/workbench/stats', True),
    ('/workbench/feihua', True),
]
OUT = os.path.join('docs', 'screenshots', 'desktop')


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page()
        # 先访问一次以建立 origin，再写入「新手引导已完成」标记，避免截图被浮层压暗
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

        for path, _ in PAGES:
            await pg.goto(f'{BASE}{path}', wait_until='networkidle')
            await pg.wait_for_timeout(1200)
            name = path.strip('/').replace('/', '_') or 'login'
            await pg.screenshot(path=os.path.join(OUT, f'{name}.png'), full_page=False)
            print('saved', name)
        await b.close()

asyncio.run(main())
