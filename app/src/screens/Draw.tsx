// Экран «Draw»: рисуешь иероглиф пальцем или мышью — нейросеть угадывает, что это.
// The Draw screen: draw a character with a finger or mouse and the neural network guesses it.
import { useEffect, useRef, useState } from 'react'
import { levelName, loadChars, speak, type Word } from '../data'
import { loadRecognizer, recognize, toImage, type Guess, type Stroke } from '../recognizer'
import { MiGrid, StrokeBox, token } from '../components'

export function Draw({ words }: { words: Word[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peekRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const drawing = useRef(false)
  const [count, setCount] = useState(0)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [info, setInfo] = useState<Record<string, [string, string]>>({})

  useEffect(() => {
    loadRecognizer().then(() => setStatus('ready'), () => setStatus('error'))
    loadChars().then(setInfo)
  }, [])

  // Перерисовываю черты на холсте. Координаты храню в долях от 0 до 100 — так не важно, какого размера экран.
  // I redraw the strokes on the canvas. Points are stored from 0 to 100, so screen size doesn't matter.
  function paint() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const r = c.width / 100
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = token('--ink', '#1c2621')
    ctx.lineWidth = 2.6 * r
    for (const s of strokes.current) {
      ctx.beginPath()
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r)))
      if (s.length === 1) ctx.lineTo(s[0][0] * r + 0.1, s[0][1] * r)
      ctx.stroke()
    }
  }

  // Маленькое окошко «что видит нейросеть» — та самая картинка 64×64, которую я ей отдаю.
  // The small "what the network sees" preview — the exact 64×64 picture I feed it.
  function paintPeek() {
    const c = peekRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(64, 64)
    if (strokes.current.length) {
      const px = toImage(strokes.current)
      for (let i = 0; i < px.length; i++) {
        const v = 255 - Math.round(px[i] * 255)
        img.data.set([v, v, v, 255], i * 4)
      }
    } else {
      img.data.fill(255)
    }
    ctx.putImageData(img, 0, 0)
  }

  // После каждой черты заново спрашиваю нейросеть.
  // After every stroke I ask the network again.
  async function update() {
    setCount(strokes.current.length)
    paint()
    paintPeek()
    if (!strokes.current.length) {
      setGuesses([])
      setPicked(null)
      return
    }
    try {
      const g = await recognize(strokes.current)
      setGuesses(g)
      setPicked(null)
    } catch {
      setStatus('error')
    }
  }

  // Подгоняю размер холста под экран (с учётом плотности пикселей, чтобы линии были чёткими).
  // I fit the canvas to the screen (with pixel density, so lines stay sharp).
  useEffect(() => {
    const c = canvasRef.current!
    const fit = () => {
      const size = c.clientWidth * Math.min(window.devicePixelRatio || 1, 2)
      c.width = c.height = Math.round(size)
      paint()
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  function pos(e: React.PointerEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100]
  }

  // Pointer-события работают и с мышью, и с пальцем, и со стилусом.
  // Pointer events work with a mouse, a finger and a stylus.
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    strokes.current.push([pos(e)])
    paint()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    strokes.current[strokes.current.length - 1].push(pos(e))
    paint()
  }
  const onUp = () => {
    if (!drawing.current) return
    drawing.current = false
    update()
  }

  const undo = () => {
    strokes.current.pop()
    update()
  }
  const clear = () => {
    strokes.current = []
    update()
  }

  // Показываю подробности по лучшему варианту (или по тому, который выбрали сами) и слова HSK с ним.
  // I show details for the top guess (or the one picked by hand) and HSK words that use it.
  const best = picked ?? guesses[0]?.char ?? null
  const usedIn = best ? words.filter((w) => w.h.includes(best)).slice(0, 6) : []

  return (
    <div className="draw">
      <header className="draw-head">
        <h1>Draw a character</h1>
        <p className="muted">
          A neural network running in your browser guesses which of {Object.keys(info).length || '2,970'} HSK characters you
          drew. Nothing is sent to a server.
        </p>
      </header>

      <div className="draw-main">
        <div className="pad">
          <MiGrid />
          <canvas
            ref={canvasRef}
            className="pad-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            aria-label="Drawing area"
          />
          {!count && <p className="pad-hint muted">Write here with a finger or mouse</p>}
          <div className="pad-tools">
            <button className="ghost" onClick={undo} disabled={!count}>Undo stroke</button>
            <button className="ghost" onClick={clear} disabled={!count}>Clear</button>
          </div>
        </div>

        <aside className="guesses" aria-live="polite">
          {status === 'loading' && <p className="muted">Loading the model…</p>}
          {status === 'error' && <p className="error">The model did not load. Reload the page to try again.</p>}
          {status === 'ready' && !guesses.length && <p className="muted">Guesses appear after each stroke.</p>}
          {guesses.length > 0 && (
            <ol className="guess-list">
              {guesses.map((g) => (
                <li key={g.char}>
                  <button className={`guess ${best === g.char ? 'guess-on' : ''}`} onClick={() => setPicked(g.char)}>
                    <span className="guess-char" lang="zh-CN">{g.char}</span>
                    <span className="guess-bar"><i style={{ width: `${Math.max(2, g.p * 100)}%` }} /></span>
                    <span className="guess-p">{Math.round(g.p * 100)}%</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <figure className="peek">
            <canvas ref={peekRef} width={64} height={64} />
            <figcaption className="muted small">What the network sees: your strokes scaled into a 64×64 picture</figcaption>
          </figure>
        </aside>
      </div>

      {best && (
        <section className="detail">
          <div className="detail-stroke">
            <StrokeBox key={best} char={best} mode="watch" />
          </div>
          <div className="detail-copy">
            <p className="detail-head">
              <span lang="zh-CN" className="detail-char">{best}</span>
              <span className="detail-pinyin">{info[best]?.[0]}</span>
              <button className="ghost" onClick={() => speak(best)}>Listen</button>
            </p>
            <p>{info[best]?.[1]}</p>
            {usedIn.length > 0 && (
              <ul className="usedin">
                {usedIn.map((w) => (
                  <li key={w.h}>
                    <span lang="zh-CN" className="usedin-h">{w.h}</span>
                    <span className="usedin-p">{w.p}</span>
                    <span className="muted">{w.m.split(';')[0]}</span>
                    <span className="tag">{levelName(w.l)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
