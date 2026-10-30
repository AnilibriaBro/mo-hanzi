"""Собираю данные для приложения из исходников в папке data-src/.
Builds the app data from the raw sources in data-src/.

Что получается / Outputs:
  app/public/data/words.json    — слова HSK 3.0 (уровни 1–6 и 7 = «7–9») / HSK 3.0 words
  app/public/data/chars.json    — пиньинь и краткое значение иероглифа / pinyin + short meaning per character
  app/public/strokes/<hex>.json — контуры и средние линии черт (формат Hanzi Writer) / stroke outlines + medians
  ml/classes.json               — иероглифы, которые учит нейросеть / characters the network learns
  ml/medians.json               — средние линии черт для обучающих картинок / stroke medians for training images

Источники / Sources: complete-hsk-vocabulary (MIT), Make Me a Hanzi (Arphic PL / LGPL).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src"
PUBLIC = ROOT / "app" / "public"


# Читаю файл черт Make Me a Hanzi: по одной строке JSON на иероглиф.
# Reads the Make Me a Hanzi stroke file: one JSON line per character.
def load_graphics():
    out = {}
    with open(SRC / "graphics.txt", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            out[d["character"]] = d
    return out


def load_dictionary():
    out = {}
    with open(SRC / "dictionary.txt", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            out[d["character"]] = d
    return out


def main():
    graphics = load_graphics()
    dictionary = load_dictionary()

    # Иду по уровням от 1 к 7, убираю повторы слов и собираю все нужные иероглифы.
    # I go through levels 1 to 7, skip repeated words and collect every character I need.
    words, chars = [], []
    seen_words, seen_chars = set(), set()
    for level in range(1, 8):
        for w in json.load(open(SRC / f"hsk{level}.json", encoding="utf-8")):
            h = w["simplified"]
            if h in seen_words:
                continue
            seen_words.add(h)
            form = w["forms"][0]
            words.append({
                "h": h,
                "p": form["transcriptions"]["pinyin"],
                "m": "; ".join(form["meanings"][:3]),
                "l": level,
                "f": w.get("frequency", 99999),
            })
            for c in h:
                if c not in seen_chars and c in graphics:
                    seen_chars.add(c)
                    chars.append(c)

    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    json.dump(words, open(PUBLIC / "data" / "words.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    char_info = {}
    for c in chars:
        d = dictionary.get(c, {})
        char_info[c] = [", ".join(d.get("pinyin", [])), (d.get("definition") or "").split(";")[0]]
    json.dump(char_info, open(PUBLIC / "data" / "chars.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # Для каждого иероглифа — свой маленький файл, приложение качает только нужные.
    # One small file per character, so the app downloads only what it needs.
    strokes_dir = PUBLIC / "strokes"
    strokes_dir.mkdir(exist_ok=True)
    for c in chars:
        g = graphics[c]
        json.dump({"strokes": g["strokes"], "medians": g["medians"], "radStrokes": []},
                  open(strokes_dir / f"{ord(c):x}.json", "w", encoding="utf-8"),
                  separators=(",", ":"))

    ml = ROOT / "ml"
    ml.mkdir(exist_ok=True)
    json.dump(chars, open(ml / "classes.json", "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({c: graphics[c]["medians"] for c in chars},
              open(ml / "medians.json", "w", encoding="utf-8"), ensure_ascii=False)

    print(f"words: {len(words)}, characters: {len(chars)}")


if __name__ == "__main__":
    main()
