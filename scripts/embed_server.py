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

# reranker 懒加载：首次 /rerank 时才载入，避免启动时双模型占内存
_reranker = None


def get_reranker():
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        _reranker = CrossEncoder("BAAI/bge-reranker-base", device="cpu")
    return _reranker


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
    logits = get_reranker().predict([(query, p) for p in passages], show_progress_bar=False)
    scores = [round(1 / (1 + math.exp(-float(s))), 4) for s in logits]
    return jsonify({"scores": scores})


@app.route("/health")
def health():
    return jsonify({"ok": True, "model": "BAAI/bge-small-zh-v1.5", "reranker": _reranker is not None})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8100, threaded=True)
