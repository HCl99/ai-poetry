"""飞花令 API 分支实测"""
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
r = s.post(f"{BASE}/api/auth/callback/credentials",
           data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
           allow_redirects=False)
assert r.status_code in (200, 302)

def play(char, played, line):
    r = s.post(f"{BASE}/api/feihua", json={"char": char, "played": played, "playerLine": line}, timeout=60)
    return r.status_code, r.json()

print("== 1) 不含令字 ==")
print(play("花", [], "床前明月光"))

print("== 2) 库内命中 + AI应战 ==")
code, d = play("月", [], "明月几时有")
print(code, "valid:", d.get("valid"), "| judged:", d.get("judged"), "| source:", d.get("source"))
print("   AI句:", d.get("aiLine", {}) and d["aiLine"]["text"], "·", d.get("aiLine", {}) and d["aiLine"]["source"])

print("== 3) 重复句 ==")
print(play("月", ["明月几时有"], "明月几时有"))

print("== 4) 库外名句 GLM 审定 ==")
code, d = play("花", [], "花间一壶酒")
print(code, "valid:", d.get("valid"), "| judged:", d.get("judged"))

print("== 5) 胡编句子应被拒 ==")
code, d = play("雪", [], "雪飞天走路")
print(code, "valid:", d.get("valid"), "| reason:", d.get("reason"))

print("== 6) 连续多轮（月字3回合） ==")
played = []
for line in ["明月几时有", "月落乌啼霜满天", "海上生明月"]:
    code, d = play("月", played, line)
    if not d.get("valid"):
        print("   被拒:", line, d.get("reason"))
        break
    played.append(line)
    ai = d.get("aiLine")
    if ai:
        print(f"   用户: {line} → AI: {ai['text']}（《{ai['source']['title']}》）")
        played.append(ai["text"])
    else:
        print(f"   用户: {line} → AI 无句可应，用户获胜")
        break
