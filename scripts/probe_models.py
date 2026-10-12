"""探测智谱账号可用模型（为 g4 多模型对比选型）"""
import requests

key = None
for line in open(".env", encoding="utf-8"):
    if line.startswith("ZHIPUAI_API_KEY="):
        key = line.strip().split("=", 1)[1].strip().strip('"')

base = "https://open.bigmodel.cn/api/paas/v4"
for m in ["glm-4-flash", "glm-4-air", "glm-4-airx", "glm-4-plus", "glm-z1-flash", "glm-4-long"]:
    try:
        r = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": m, "messages": [{"role": "user", "content": "说一个字：好"}], "max_tokens": 10},
            timeout=30,
        )
        if r.ok:
            print(m, "OK ->", r.json()["choices"][0]["message"]["content"][:20].replace("\n", " "))
        else:
            print(m, "FAIL", r.status_code, str(r.json().get("error", {}).get("message", ""))[:80])
    except Exception as e:
        print(m, "EXC", str(e)[:60])
