"""Ужимаю модель для сайта: веса из 32-битных чисел делаю 8-битными (квантизация) — файл в ~4 раза меньше.
Потом сравниваю точность сжатой и исходной модели на свежих обучающих картинках.
Shrinks the model for the web: 32-bit weights become 8-bit (quantization), about 4x smaller.
Then I compare the accuracy of the small and the original model on fresh training images.

Запуск / Usage:  python ml/shrink.py   (после / after ml/export.py)
"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

sys.path.insert(0, str(Path(__file__).parent))
import train

dst = train.ROOT / "app" / "public" / "model"
full = train.ML / "out" / "hanzi-fp32.onnx"
small = dst / "hanzi.onnx"
if not full.exists() or small.stat().st_size > full.stat().st_size / 2:
    full.write_bytes(small.read_bytes())  # свежий экспорт ещё не сжат / a fresh export is not shrunk yet
# Квантизатор ONNX не умеет работать с русскими буквами в пути, поэтому сжимаю во временной папке.
# The ONNX quantizer breaks on Cyrillic paths, so I quantize inside a temporary folder.
with tempfile.TemporaryDirectory() as tmp:
    src, out = Path(tmp) / "in.onnx", Path(tmp) / "out.onnx"
    src.write_bytes(full.read_bytes())
    quantize_dynamic(str(src), str(out), weight_type=QuantType.QUInt8)
    small.write_bytes(out.read_bytes())
print(f"{full.stat().st_size / 1e6:.1f} MB -> {small.stat().st_size / 1e6:.1f} MB")

# Проверяю обе модели на одних и тех же картинках, с обычными и усиленными искажениями.
# I test both models on the same images, with normal and stronger distortions.
data = train.load_medians("cuda" if torch.cuda.is_available() else "cpu")
C = len(data[0])
sessions = {name: ort.InferenceSession(str(p), providers=["CPUExecutionProvider"]) for name, p in [("fp32", full), ("int8", small)]}
for strength in (1.0, 1.4):
    torch.manual_seed(3)
    idx = torch.randint(0, C, (3000,), device=data[1].device)
    x = torch.cat([train.make_batch(idx[i:i + 250], data, strength) for i in range(0, 3000, 250)]).cpu().numpy()
    y = idx.cpu().numpy()
    for name, s in sessions.items():
        pred = np.concatenate([s.run(None, {"image": x[i:i + 500]})[0].argmax(1) for i in range(0, 3000, 500)])
        print(f"distortion {strength}: {name} top1 {(pred == y).mean():.3f}")
