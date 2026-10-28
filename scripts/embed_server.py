# -*- coding: utf-8 -*-
"""
embed_server.py - 本地 BGE 向量化 + 精排微服务（供 Next.js 服务端调用）
POST /embed  {"texts": ["..."]}              -> {"vectors": [[...], ...], "dims": 512}
POST /rerank {"query": "...", "passages": []} -> {"scores": [...]}  (0~1, sigmoid 归一化)
"""
import math
import os

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import torch
from flask import Flask, jsonify, request
from sentence_transformers import SentenceTransformer

torch.set_num_threads(max(1, (os.cpu_count() or 8) - 2))

app = Flask(__name__)
model = SentenceTransformer("BAAI/bge-small-zh-v1.5", device="cpu")

# reranker 启动即预加载：首次精排请求无需等待模型载入
# （懒加载时模型载入 >60s 会让首次 /rerank 超时而降级为粗排，冷启动注解长达 3~5 分钟）
_reranker = None


def load_reranker():
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        print("[reranker] 预加载 BAAI/bge-reranker-base ...", flush=True)
        _reranker = CrossEncoder("BAAI/bge-reranker-base", device="cpu")
        print("[reranker] 就绪", flush=True)
    return _reranker


try:
    load_reranker()
except Exception as e:  # 模型缺失/下载失败时仍提供向量能力，精排由调用方降级
    print(f"[reranker] 预加载失败，精排将降级为粗排：{type(e).__name__}: {e}", flush=True)


def get_reranker():
    return load_reranker()



@app.route("/embed", methods=["POST"])
def embed():
    data = request.get_json(force=True)
    texts = data.get("texts") or []
    if not texts:
        return jsonify({"vectors": [], "dims": 0})
    texts = [str(t)[:400] for t in texts][:64]
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return jsonify({
        "vectors": [[round(float(x), 4) for x in v] for v in vecs],
        "dims": int(vecs.shape[1]),
    })


@app.route("/rerank", methods=["POST"])
def rerank():
    data = request.get_json(force=True)
    query = str(data.get("query") or "")[:400]
    passages = [str(p)[:400] for p in (data.get("passages") or [])][:32]
    if not query or not passages:
        return jsonify({"scores": []})
    raw = get_reranker().predict([(query, p) for p in passages], show_progress_bar=False)
    # sentence-transformers ≥5 的 predict 已应用 sigmoid，返回 0~1 概率；
    # 旧版本返回 logits，需在此补一次 sigmoid（避免二次 sigmoid 把所有分数压到 0.5~0.7）
    scores = []
    for s in raw:
        v = float(s)
        if v < 0 or v > 1:
            v = 1 / (1 + math.exp(-v))
        scores.append(round(v, 4))
    return jsonify({"scores": scores})


@app.route("/health")
def health():
    return jsonify({"ok": True, "model": "BAAI/bge-small-zh-v1.5", "reranker": _reranker is not None})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8100, threaded=True)
