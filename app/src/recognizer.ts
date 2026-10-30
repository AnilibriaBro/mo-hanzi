// Распознавание рукописного иероглифа нейросетью прямо в браузере (ONNX Runtime Web).
// Handwritten character recognition with a neural network right in the browser (ONNX Runtime Web).
import * as ort from 'onnxruntime-web/wasm'

// Эти числа должны совпадать с ml/train.py: картинка 64×64, рисунок вписан в квадрат 56×56.
// These numbers must match ml/train.py: a 64×64 image with the drawing fitted into 56×56.
const SIZE = 64
const BOX = 56
const LINE = 4.2

export type Point = [number, number]
export type Stroke = Point[]
export type Guess = { char: string; p: number }

const base = import.meta.env.BASE_URL
// Из public/ беру только .wasm, а загрузчик собирается вместе с библиотекой.
// Only the .wasm file comes from public/; the loader script is bundled with the library.
ort.env.wasm.wasmPaths = { wasm: `${base}ort/ort-wasm-simd-threaded.wasm` }
ort.env.wasm.numThreads = 1

let ready: Promise<{ session: ort.InferenceSession; classes: string[] }> | null = null

// Загружаю модель и список иероглифов один раз, при первом заходе на экран «Draw».
// I load the model and the character list once, the first time the Draw screen opens.
export function loadRecognizer() {
  ready ??= Promise.all([
    ort.InferenceSession.create(`${base}model/hanzi.onnx`),
    fetch(`${base}model/classes.json`).then((r) => r.json() as Promise<string[]>),
  ]).then(([session, classes]) => ({ session, classes }))
  return ready
}

// Рисую черты пользователя так же, как рисовались картинки при обучении: нахожу края рисунка,
// масштабирую в 56×56 по центру и возвращаю «сколько чернил» в каждом пикселе (0…1).
// I draw the user's strokes the same way the training images were made: find the drawing's
// bounds, scale it into 56×56 in the center and return how much ink is in each pixel (0…1).
export function toImage(strokes: Stroke[]): Float32Array {
  const pts = strokes.flat()
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const lo = [Math.min(...xs), Math.min(...ys)]
  const hi = [Math.max(...xs), Math.max(...ys)]
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], 1e-3)
  const k = BOX / span
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = LINE
  ctx.strokeStyle = '#000'
  for (const s of strokes) {
    ctx.beginPath()
    s.forEach(([x, y], i) => {
      const px = (x - mid[0]) * k + SIZE / 2
      const py = (y - mid[1]) * k + SIZE / 2
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    if (s.length === 1) ctx.lineTo((s[0][0] - mid[0]) * k + SIZE / 2 + 0.1, (s[0][1] - mid[1]) * k + SIZE / 2)
    ctx.stroke()
  }
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data
  const out = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] / 255
  return out
}

// Прогоняю картинку через нейросеть и превращаю ответ в вероятности (softmax), беру лучшие варианты.
// I run the image through the network, turn the output into probabilities (softmax) and keep the top guesses.
export async function recognize(strokes: Stroke[], top = 6): Promise<Guess[]> {
  if (!strokes.length) return []
  const { session, classes } = await loadRecognizer()
  const input = new ort.Tensor('float32', toImage(strokes), [1, 1, SIZE, SIZE])
  const result = await session.run({ image: input })
  const logits = result.logits.data as Float32Array
  let max = -Infinity
  for (const v of logits) max = Math.max(max, v)
  let sum = 0
  const probs = Array.from(logits, (v) => {
    const e = Math.exp(v - max)
    sum += e
    return e
  })
  return probs
    .map((p, i) => ({ char: classes[i], p: p / sum }))
    .sort((a, b) => b.p - a.p)
    .slice(0, top)
}
