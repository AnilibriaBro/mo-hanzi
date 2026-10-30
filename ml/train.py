"""Обучаю нейросеть распознавать рукописные иероглифы — без готовой базы почерков.

Главная идея: каждую обучающую картинку я рисую сам, прямо на видеокарте, из средних линий черт
(Make Me a Hanzi). Черты дрожат, сдвигаются, растягиваются и наклоняются, как у живого человека,
каждый раз по-новому, поэтому сеть ни разу не видит одну и ту же картинку дважды. Браузер
обрабатывает рисунок пользователя точно так же, поэтому сеть получает привычные картинки.

I train a network to recognize handwritten Chinese characters without any handwriting dataset.

The key idea: I draw every training image myself, right on the GPU, from stroke medians
(Make Me a Hanzi). Strokes wobble, shift, stretch and tilt like a real hand, differently every
time, so the network never sees the same picture twice. The browser processes the user's drawing
the same way, so the network gets the kind of picture it was trained on.

Запуск / Usage:  python ml/train.py [--steps 30000]
Результат / Writes: ml/out/model.pt, app/public/model/hanzi.onnx, app/public/model/classes.json
"""
import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parent.parent
ML = ROOT / "ml"
SIZE = 64          # сторона картинки в пикселях / image side, pixels
BOX = 56           # иероглиф вписываю в этот квадрат по центру / the character fits this box, centered
MAX_PTS = 0        # заполняется в load_medians() / filled in by load_medians()


def load_medians(device):
    """Складываю черты всех иероглифов в общие таблицы (тензоры) одинаковой длины.
    Packs every character's stroke medians into padded tensors of equal length.

    pts   [C, N, 2]  points in a 1024 box, y pointing down
    sid   [C, N]     stroke index of each point
    seg   [C, N-1]   True where point i and i+1 form a segment of the same stroke
    """
    global MAX_PTS
    classes = json.load(open(ML / "classes.json", encoding="utf-8"))
    medians = json.load(open(ML / "medians.json", encoding="utf-8"))
    rows = []
    for c in classes:
        p, s = [], []
        for k, stroke in enumerate(medians[c]):
            for x, y in stroke:
                p.append((x, 900 - y))
                s.append(k)
        rows.append((p, s))
    MAX_PTS = max(len(p) for p, _ in rows)
    C = len(classes)
    pts = torch.zeros(C, MAX_PTS, 2)
    sid = torch.full((C, MAX_PTS), -1, dtype=torch.long)
    for i, (p, s) in enumerate(rows):
        pts[i, : len(p)] = torch.tensor(p, dtype=torch.float)
        sid[i, : len(s)] = torch.tensor(s)
    seg = (sid[:, :-1] == sid[:, 1:]) & (sid[:, :-1] >= 0)
    return classes, pts.to(device), sid.to(device), seg.to(device)


def augment(pts, sid, valid, strength=1.0):
    """Искажаю иероглифы «как рукой»: каждая черта сдвигается и масштабируется отдельно,
    каждая точка чуть дрожит, а весь иероглиф поворачивается, наклоняется и растягивается.
    Hand-like distortions: each stroke shifts and scales on its own, every point wobbles a little,
    and the whole character is rotated, sheared and stretched."""
    B, N, _ = pts.shape
    dev = pts.device
    n_strokes = 40
    sid_c = sid.clamp(min=0)
    onehot = F.one_hot(sid_c, n_strokes).float() * valid.unsqueeze(-1)       # [B,N,S]
    count = onehot.sum(1).clamp(min=1)                                          # [B,S]
    centers = torch.einsum("bns,bnd->bsd", onehot, pts) / count.unsqueeze(-1)   # [B,S,2]
    c_pt = torch.gather(centers, 1, sid_c.unsqueeze(-1).expand(-1, -1, 2))      # [B,N,2]

    # каждая черта: свой сдвиг и масштаб / each stroke: own shift and scale around its center
    shift = torch.randn(B, n_strokes, 2, device=dev) * 22 * strength
    scale = 1 + torch.randn(B, n_strokes, 1, device=dev) * 0.08 * strength
    pts = c_pt + (pts - c_pt) * torch.gather(scale, 1, sid_c.unsqueeze(-1)) \
        + torch.gather(shift, 1, sid_c.unsqueeze(-1).expand(-1, -1, 2))
    # каждая точка: небольшое дрожание / each point: a small wobble
    pts = pts + torch.randn_like(pts) * 9 * strength

    # весь иероглиф: поворот, наклон, неровный масштаб / whole character: rotation, shear, uneven scale
    ang = torch.randn(B, device=dev) * 0.09 * strength
    shear = torch.randn(B, device=dev) * 0.12 * strength
    sx = 1 + torch.randn(B, device=dev) * 0.1 * strength
    sy = 1 + torch.randn(B, device=dev) * 0.1 * strength
    cos, sin = torch.cos(ang), torch.sin(ang)
    m = torch.stack([
        torch.stack([cos * sx, (-sin + shear) * sy], -1),
        torch.stack([sin * sx, cos * sy], -1),
    ], 1)                                                                        # [B,2,2]
    return torch.einsum("bij,bnj->bni", m, pts - 512) + 512


def normalize(pts, valid):
    """Вписываю рисунок в квадрат 56×56 по центру картинки 64×64 — так же, как в приложении.
    Fits the drawing into 56×56 in the center of 64×64, exactly like the app does."""
    big = torch.full_like(pts, 1e9)
    lo = torch.where(valid.unsqueeze(-1), pts, big).amin(1)
    hi = torch.where(valid.unsqueeze(-1), pts, -big).amax(1)
    span = (hi - lo).amax(-1).clamp(min=1e-3)
    k = (BOX / span).unsqueeze(-1).unsqueeze(-1)
    mid = ((lo + hi) / 2).unsqueeze(1)
    return (pts - mid) * k + SIZE / 2


def rasterize(pts, seg, width):
    """Рисую черты линиями: яркость пикселя зависит от расстояния до ближайшей черты.
    Draws strokes as lines: a pixel's brightness depends on its distance to the nearest stroke."""
    # половинной точности хватает для картинки 64×64, а считается быстрее
    # half precision is enough for a 64×64 image and halves the memory traffic
    pts = pts.half() if pts.is_cuda else pts
    a, b = pts[:, :-1], pts[:, 1:]                                   # [B,M,2]
    ys, xs = torch.meshgrid(torch.arange(SIZE, device=pts.device) + 0.5,
                            torch.arange(SIZE, device=pts.device) + 0.5, indexing="ij")
    p = torch.stack([xs, ys], -1).view(1, -1, 1, 2)                 # [1,P,1,2]
    a_, ab = a.unsqueeze(1), (b - a).unsqueeze(1)                    # [B,1,M,2]
    t = ((p - a_) * ab).sum(-1) / (ab * ab).sum(-1).clamp(min=1e-6)
    t = t.clamp(0, 1)
    d = (p - (a_ + t.unsqueeze(-1) * ab)).norm(dim=-1)               # [B,P,M]
    d = torch.where(seg.unsqueeze(1), d, torch.full_like(d, 1e3)).amin(-1)
    img = (width.view(-1, 1) + 0.5 - d.float()).clamp(0, 1)
    return img.view(-1, 1, SIZE, SIZE)


def make_batch(idx, data, strength=1.0):
    _, pts_all, sid_all, seg_all = data
    pts, sid, seg = pts_all[idx], sid_all[idx], seg_all[idx]
    n = int((sid >= 0).sum(1).max())          # отрезаю лишнее пустое место / drop unused padding
    pts, sid, seg = pts[:, :n], sid[:, :n], seg[:, : n - 1]
    valid = sid >= 0
    pts = augment(pts, sid, valid, strength)
    pts = normalize(pts, valid)
    width = 0.9 + torch.rand(len(idx), device=pts.device) * 1.6
    return rasterize(pts, seg, width)


# Блок сети: две свёртки 3×3 с нормализацией. Таких блоков четыре подряд, каждый шире.
# A network block: two 3×3 convolutions with normalization. Four of them in a row, each wider.
def block(cin, cout):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
    )


class Net(nn.Module):
    def __init__(self, n_classes):
        super().__init__()
        self.features = nn.Sequential(
            block(1, 48), nn.MaxPool2d(2),      # 32
            block(48, 96), nn.MaxPool2d(2),     # 16
            block(96, 160), nn.MaxPool2d(2),    # 8
            block(160, 256), nn.MaxPool2d(2),   # 4
        )
        self.head = nn.Sequential(nn.Flatten(), nn.Dropout(0.3), nn.Linear(256 * 16, 512),
                                  nn.ReLU(inplace=True), nn.Dropout(0.3), nn.Linear(512, n_classes))

    def forward(self, x):
        return self.head(self.features(x))


# Проверка точности: top1 — угадал с первого раза, top5 — верный ответ среди пяти вариантов.
# Accuracy check: top1 is right on the first guess, top5 has the right answer among five.
@torch.no_grad()
def evaluate(model, data, strength, n=6000):
    model.eval()
    C = data[1].shape[0]
    g = torch.Generator(device=data[1].device).manual_seed(7)
    correct1 = correct5 = 0
    for i in range(0, n, 250):
        idx = torch.randint(0, C, (250,), device=data[1].device, generator=g)
        logits = model(make_batch(idx, data, strength))
        top5 = logits.topk(5, -1).indices
        correct1 += (top5[:, 0] == idx).sum().item()
        correct5 += (top5 == idx.unsqueeze(-1)).any(-1).sum().item()
    model.train()
    return correct1 / n, correct5 / n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=30000)
    ap.add_argument("--batch", type=int, default=256)
    args = ap.parse_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(0)
    data = load_medians(dev)
    classes = data[0]
    C = len(classes)
    print(f"{C} classes, up to {MAX_PTS} points per character, device {dev}", flush=True)

    model = Net(C).to(dev)
    print(f"{sum(p.numel() for p in model.parameters()) / 1e6:.2f}M parameters", flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=5e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=args.steps, pct_start=0.05)

    out = ML / "out"
    out.mkdir(exist_ok=True)
    t0 = time.time()
    for step in range(1, args.steps + 1):
        idx = torch.randint(0, C, (args.batch,), device=dev)
        # сначала искажения слабые, потом сильнее / distortions start weak and grow
        strength = min(1.0, 0.4 + step / (args.steps * 0.3))
        x = make_batch(idx, data, strength)
        with torch.autocast(dev, dtype=torch.bfloat16, enabled=dev == "cuda"):
            loss = F.cross_entropy(model(x), idx, label_smoothing=0.1)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        if step % 500 == 0 or step == args.steps:
            msg = f"step {step}  loss {loss.item():.3f}  {time.time() - t0:.0f}s"
            if step % 2500 == 0 or step == args.steps:
                a1, a5 = evaluate(model, data, 1.0)
                h1, h5 = evaluate(model, data, 1.4)
                msg += f"  top1 {a1:.3f} top5 {a5:.3f}  | harder: top1 {h1:.3f} top5 {h5:.3f}"
                torch.save(model.state_dict(), out / "model.pt")
            print(msg, flush=True)

    # Сохраняю модель в формате ONNX — его умеет запускать браузер.
    # I export the model to ONNX, a format the browser can run.
    model.eval().cpu()
    dst = ROOT / "app" / "public" / "model"
    dst.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(model, torch.zeros(1, 1, SIZE, SIZE), dst / "hanzi.onnx",
                      input_names=["image"], output_names=["logits"],
                      dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
                      opset_version=17, dynamo=False)
    json.dump(classes, open(dst / "classes.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("exported", dst / "hanzi.onnx", flush=True)


if __name__ == "__main__":
    main()
