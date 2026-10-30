"""Выгружаю сохранённую модель (ml/out/model.pt) в ONNX для браузера — можно прямо во время обучения.
Exports the saved checkpoint (ml/out/model.pt) to ONNX for the browser — works even while training runs.

Запуск / Usage:  python ml/export.py
"""
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
import train

classes = json.load(open(train.ML / "classes.json", encoding="utf-8"))
model = train.Net(len(classes))
model.load_state_dict(torch.load(train.ML / "out" / "model.pt", map_location="cpu"))
model.eval()

dst = train.ROOT / "app" / "public" / "model"
dst.mkdir(parents=True, exist_ok=True)
torch.onnx.export(model, torch.zeros(1, 1, train.SIZE, train.SIZE), dst / "hanzi.onnx",
                  input_names=["image"], output_names=["logits"],
                  dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
                  opset_version=17, dynamo=False)
json.dump(classes, open(dst / "classes.json", "w", encoding="utf-8"), ensure_ascii=False)
print("exported", dst / "hanzi.onnx")
