"""Сохраняю лист обучающих картинок в ml/out/samples.png, чтобы проверить их глазами.
Saves a sheet of training images to ml/out/samples.png to check them by eye."""
import sys
import torch
from PIL import Image
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
import train

data = train.load_medians("cuda")
torch.manual_seed(1)
rows = []
for k in range(8):
    idx = torch.full((12,), k * 37, device="cuda")
    rows.append(train.make_batch(idx, data, 1.0)[:, 0])
grid = torch.cat([torch.cat(list(r), 1) for r in rows], 0)
img = Image.fromarray(((1 - grid) * 255).byte().cpu().numpy()).resize((12 * 128, 8 * 128), Image.NEAREST)
img.save(train.ML / "out" / "samples.png")
print([data[0][k * 37] for k in range(8)])
