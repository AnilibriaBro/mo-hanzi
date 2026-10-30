// Общие детали интерфейса, из которых я собираю все экраны.
// Shared UI pieces that I build every screen from.
import { useEffect, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import { charDataLoader } from './data'

// Квадрат-пропись 米字格, как в китайских тетрадях: рамка, крест и диагонали пунктиром.
// The 米字格 practice square from Chinese copybooks: a frame, a dashed cross and dashed diagonals.
export function MiGrid({ diagonals = true }: { diagonals?: boolean }) {
  return (
    <svg className="migrid" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
      <rect x="0.5" y="0.5" width="99" height="99" className="migrid-frame" />
      <path d="M50 0V100M0 50H100" className="migrid-guide" />
      {diagonals && <path d="M0 0L100 100M100 0L0 100" className="migrid-guide" />}
    </svg>
  )
}

// Один иероглиф в своей клетке, а пиньинь — строкой над ним, как в учебниках.
// trace = бледный иероглиф «для обводки», как в прописях.
// One character in its own square with pinyin on the line above, like in textbooks.
// trace = a pale character to trace over, like in copybooks.
export function HanziCell({ char, pinyin, size = 'l', trace }: { char: string; pinyin?: string; size?: 's' | 'm' | 'l'; trace?: boolean }) {
  return (
    <div className={`cell cell-${size}${trace ? ' cell-trace' : ''}`}>
      <div className="cell-pinyin" aria-hidden={!pinyin}>{pinyin ?? ' '}</div>
      <div className="cell-square">
        <MiGrid />
        <span className="cell-char" lang="zh-CN">{char}</span>
      </div>
    </div>
  )
}

// Делю пиньинь слова на слоги, чтобы над каждым иероглифом стоял свой слог.
// I split a word's pinyin into syllables so each character gets its own one.
export function syllables(word: string, pinyin: string): (string | undefined)[] {
  const chars = [...word]
  const parts = pinyin.split(/\s+/).filter(Boolean)
  if (parts.length === chars.length) return parts
  // У некоторых слов (идиомы со знаками, эризация) слоги не совпадают с иероглифами —
  // такие показываю целой строкой.
  // For a few words (idioms with punctuation, erhua) syllables don't match the characters,
  // so I show the pinyin as one line instead.
  return chars.map(() => undefined)
}

// Слово целиком: клетки идут вплотную, как строчка в тетради.
// A whole word: squares touch each other like a line in a notebook.
export function Word({ word, pinyin, size = 'l' }: { word: string; pinyin?: string; size?: 's' | 'm' | 'l' }) {
  const sy = pinyin ? syllables(word, pinyin) : []
  const split = pinyin ? sy.filter(Boolean).length === [...word].length : false
  return (
    <div className="word">
      {!split && pinyin && <div className={`word-pinyin word-pinyin-${size}`}>{pinyin}</div>}
      <div className="word-cells">
        {[...word].map((c, i) => (
          <HanziCell key={i} char={c} size={size} pinyin={split ? sy[i] : undefined} />
        ))}
      </div>
    </div>
  )
}

// Беру цвет из CSS-переменной, чтобы рисунки подстраивались под светлую и тёмную тему.
// I read a color from a CSS variable so drawings follow the light and dark theme.
export function token(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// Порядок черт и тренировка письма поверх клетки (библиотека Hanzi Writer).
// "watch" — показываю, как пишется иероглиф; "write" — пользователь пишет сам, а программа проверяет каждую черту.
// Stroke order and writing practice on top of the square (Hanzi Writer library).
// "watch" plays how the character is written; "write" lets the user draw it and checks every stroke.
export function StrokeBox({ char, mode, onDone }: { char: string; mode: 'watch' | 'write'; onDone?: (mistakes: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const [missing, setMissing] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = ''
    setMissing(false)
    const size = el.clientWidth
    const INK = token('--ink', '#1c2621')
    const SEAL = token('--seal', '#b5302a')
    const writer = HanziWriter.create(el, char, {
      width: size,
      height: size,
      padding: size * 0.06,
      strokeColor: INK,
      radicalColor: INK,
      outlineColor: token('--guide-soft', '#c9dccd'),
      drawingColor: INK,
      drawingWidth: Math.max(6, size / 22),
      highlightColor: SEAL,
      showCharacter: false,
      showOutline: mode === 'watch',
      strokeAnimationSpeed: 1.8,
      delayBetweenStrokes: 120,
      // Черты беру из своих файлов в public/strokes, а не с чужого сервера.
      // Strokes come from my own files in public/strokes, not from someone else's server.
      charDataLoader: (c, onLoad, onError) => charDataLoader(c, onLoad as (d: unknown) => void, () => {
        setMissing(true)
        onError?.()
      }),
    })
    writerRef.current = writer
    if (mode === 'watch') {
      writer.animateCharacter()
    } else {
      // После двух ошибок подряд подсвечиваю следующую черту красным — подсказка.
      // After two misses in a row the next stroke flashes red as a hint.
      writer.quiz({
        leniency: 1.2,
        showHintAfterMisses: 2,
        onComplete: (s: { totalMistakes: number }) => doneRef.current?.(s.totalMistakes),
      })
    }
    return () => {
      writer.cancelQuiz?.()
      writerRef.current = null
    }
  }, [char, mode])

  return (
    <div className="strokebox">
      <MiGrid />
      <div ref={ref} className="strokebox-canvas" />
      {missing && <p className="strokebox-missing">No stroke data for {char}</p>}
      {mode === 'watch' && (
        <button className="ghost strokebox-replay" onClick={() => writerRef.current?.animateCharacter()}>
          Replay
        </button>
      )}
    </div>
  )
}

// Красная печать, которая «штампует» карточку, когда слово вспомнил.
// The red seal that stamps the card when a word is remembered.
export function Seal({ text, show }: { text: string; show: boolean }) {
  return (
    <div className={`seal ${show ? 'seal-on' : ''}`} aria-hidden="true">
      <span lang="zh-CN">{text}</span>
    </div>
  )
}
