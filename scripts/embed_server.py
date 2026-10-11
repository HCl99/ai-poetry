# -*- coding: utf-8 -*-
"""
embed_server.py - 本地 BGE 向量化微服务（供 Next.js 服务端调用）
POST /embed {"texts": ["..."]} -> {"vectors": [[...], ...], "dims": 512}
"""
import os

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

from flask import Flask, jsonify, request
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
model = SentenceTransformer("BAAI/bge-small-zh-v1.5", device="cpu")


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


@app.route("/health")
def health():
    return jsonify({"ok": True, "model": "BAAI/bge-small-zh-v1.5"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8100, threaded=True)
