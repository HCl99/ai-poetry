# -*- coding: utf-8 -*-
"""smoke_local_embed.py - 下载 BGE-small-zh 并冒烟测速"""
import os
import time

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

from sentence_transformers import SentenceTransformer

t0 = time.time()
model = SentenceTransformer("BAAI/bge-small-zh-v1.5", device="cpu")
print(f"模型加载 {time.time() - t0:.1f}s")

texts = [f"测试诗句{i}：明月松间照，清泉石上流。人闲桂花落，夜静春山空。" for i in range(128)]
t0 = time.time()
vecs = model.encode(texts, batch_size=128, normalize_embeddings=True)
el = time.time() - t0
print(f"128 条编码 {el:.2f}s -> {128 / el:.0f} 条/s, 维度 {vecs.shape}")
