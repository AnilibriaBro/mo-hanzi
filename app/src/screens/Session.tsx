// Экран занятия: показываю карточки по очереди, пользователь оценивает, насколько помнит слово.
// The study screen: cards come one by one and the user rates how well they remember each word.
import { useEffect, useMemo, useState } from 'react'
import type { Grade } from 'ts-fsrs'
import { speak, type Word as W } from '../data'
import { formatDue, grade, preview, Rating, today, useStore } from '../store'
import { Seal, StrokeBox, Word } from '../components'
import { buildQueue } from './Today'

// Четыре оценки, как в Anki. Цифры 1–4 — быстрые клавиши.
// Four grades, like in Anki. Keys 1–4 are shortcuts.
const GRADES: { g: Grade; label: string; key: string }[] = [
  { g: Rating.Again, label: 'Forgot', key: '1' },
  { g: Rating.Hard, label: 'Hard', key: '2' },
  { g: Rating.Good, label: 'Knew it', key: '3' },
  { g: Rating.Easy, label: 'Easy', key: '4' },
]

export function Session({ words, onExit }: { words: W[]; onExit: () => void }) {
  const s = useStore()
  // Очередь собираю один раз при старте; забытые карточки отправляю в конец, чтобы повторить ещё раз.
  // I build the queue once when the session starts; forgotten cards go to the end to be repeated.
  const [queue, setQueue] = useState<W[]>(() => {
    const { due, fresh } = buildQueue(words, s.level, s.cards, s.days[today()]?.learned ?? 0, s.newPerDay)
    return [...due, ...fresh]
  })
  const [shown, setShown] = useState(false)
  const [tool, setTool] = useState<'none' | 'watch' | 'write'>('none')
  const [charIdx, setCharIdx] = useState(0)
  const [stamp, setStamp] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const word = queue[0]
  const isNew = word ? !s.cards[word.h] : false
  // Новое слово вспоминать нечего, поэтому сразу показываю его целиком.
  // A new word has nothing to recall yet, so I show it whole right away.
  const open = shown || isNew
  const due = useMemo(() => (word && open ? preview(word.h) : null), [word, open])

  // Сохраняю оценку: алгоритм FSRS сам решает, когда показать слово снова.
  // Хорошая оценка — ставлю печать 对 («верно»).
  // I save the grade: the FSRS algorithm decides when to show the word again.
  // A good grade stamps the 对 ("correct") seal.
  function answer(g: Grade) {
    if (!word) return
    grade(word.h, g)
    const again = g === Rating.Again
    if (!again) {
      setStamp(true)
      setTimeout(() => setStamp(false), 520)
    }
    setTimeout(() => {
      setQueue((q) => (again ? [...q.slice(1), q[0]] : q.slice(1)))
      setDoneCount((n) => n + (again ? 0 : 1))
      setShown(false)
      setTool('none')
      setCharIdx(0)
    }, again ? 0 : 380)
  }

  // Управление с клавиатуры: пробел открывает ответ, 1–4 ставят оценку.
  // Keyboard control: Space shows the answer, 1–4 grade it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (!open && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setShown(true)
      } else if (open) {
        const hit = GRADES.find((x) => x.key === e.key)
        if (hit) answer(hit.g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!word) {
    return (
      <div className="session-end">
        <Seal text="好" show />
        <h1>Session complete</h1>
        <p className="muted">{doneCount} cards done. The next ones are scheduled for when you are about to forget them.</p>
        <button className="primary" onClick={onExit}>Back to today</button>
      </div>
    )
  }

  const chars = [...word.h]

  return (
    <div className="session">
      <div className="session-bar">
        <button className="ghost" onClick={onExit}>End session</button>
        <span className="muted">{queue.length} left{isNew ? ', new word' : ''}</span>
      </div>

      <div className="card">
        <Seal text="对" show={stamp} />
        <Word word={word.h} pinyin={open ? word.p : undefined} />
        {open ? (
          <div className="answer">
            {isNew && <p className="new-note">New word. Listen, watch the strokes, then rate how well it stuck.</p>}
            <p className="meaning">{word.m}</p>
            <div className="answer-tools">
              <button className="ghost" onClick={() => speak(word.h)}>Listen</button>
              <button className={`ghost ${tool === 'watch' ? 'ghost-on' : ''}`} onClick={() => setTool(tool === 'watch' ? 'none' : 'watch')}>
                Stroke order
              </button>
              <button className={`ghost ${tool === 'write' ? 'ghost-on' : ''}`} onClick={() => setTool(tool === 'write' ? 'none' : 'write')}>
                Write it
              </button>
            </div>
            {tool !== 'none' && (
              <div className="answer-stroke">
                {chars.length > 1 && (
                  <div className="char-pick">
                    {chars.map((c, i) => (
                      <button key={i} className={`level ${i === charIdx ? 'level-on' : ''}`} onClick={() => setCharIdx(i)} lang="zh-CN">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {/* Когда дописал один иероглиф, сам перехожу к следующему в слове. */}
                {/* After one character is finished I move on to the next one in the word. */}
                <StrokeBox
                  key={`${word.h}-${charIdx}-${tool}`}
                  char={chars[charIdx]}
                  mode={tool}
                  onDone={() => charIdx < chars.length - 1 && setTimeout(() => setCharIdx(charIdx + 1), 600)}
                />
                {tool === 'write' && <p className="muted small">Draw the strokes in order. After two misses the next stroke flashes red.</p>}
              </div>
            )}
          </div>
        ) : (
          <p className="prompt muted">Say it aloud and recall the meaning, then check.</p>
        )}
      </div>

      <div className="grades">
        {open ? (
          GRADES.map(({ g, label, key }) => (
            <button key={g} className={`grade grade-${g}`} onClick={() => answer(g)}>
              <span>{label}</span>
              <small>{due ? formatDue(due[g]) : ''}</small>
              <kbd>{key}</kbd>
            </button>
          ))
        ) : (
          <button className="primary wide" onClick={() => setShown(true)}>
            Show answer <kbd>Space</kbd>
          </button>
        )}
      </div>
    </div>
  )
}
