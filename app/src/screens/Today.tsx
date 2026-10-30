// Главный экран «Сегодня»: сколько карточек ждёт, выбор уровня HSK и лист прогресса.
// The Today screen: how many cards are waiting, HSK level choice and the progress sheet.
import { useMemo } from 'react'
import { LEVELS, levelName, type Word } from '../data'
import { setLevel, strength, today, useStore } from '../store'
import { HanziCell } from '../components'

// Собираю очередь на сегодня: сначала слова, которые пора повторить, потом новые (не больше дневной нормы).
// I build today's queue: first the words due for review, then new ones (up to the daily limit).
export function buildQueue(words: Word[], level: number, cards: ReturnType<typeof useStore>['cards'], learnedToday: number, newPerDay: number) {
  const now = Date.now()
  const inLevel = words.filter((w) => w.l === level)
  const due = words
    .filter((w) => cards[w.h] && new Date(cards[w.h].dueAt).getTime() <= now)
    .sort((a, b) => new Date(cards[a.h].dueAt).getTime() - new Date(cards[b.h].dueAt).getTime())
  const fresh = inLevel.filter((w) => !cards[w.h]).slice(0, Math.max(0, newPerDay - learnedToday))
  return { due, fresh, inLevel }
}

export function Today({ words, onStart }: { words: Word[]; onStart: () => void }) {
  const s = useStore()
  const learned = s.days[today()]?.learned ?? 0
  const { due, fresh, inLevel } = useMemo(
    () => buildQueue(words, s.level, s.cards, learned, s.newPerDay),
    [words, s.level, s.cards, learned, s.newPerDay],
  )
  // Первые иероглифы на сегодня выписываю строчкой как в прописях: первый — чернилами, остальные бледные, для обводки.
  // Today's first characters as a copybook line: the first in ink, the rest pale, to trace over.
  const line = [...new Set([...due, ...fresh].flatMap((w) => [...w.h]))].slice(0, 6)
  const known = inLevel.filter((w) => strength(s.cards[w.h]) >= 3).length
  const started = inLevel.filter((w) => s.cards[w.h]).length
  const total = due.length + fresh.length

  return (
    <div className="today">
      <section className="today-hero">
        <div className="copyline" aria-hidden="true">
          {(line.length ? line : ['好']).map((c, i) => (
            <HanziCell key={c} char={c} size="l" trace={i > 0} />
          ))}
        </div>
        <div className="today-copy">
          <div>
          <h1>{total ? `${total} cards for today` : 'All done for today'}</h1>
          <p className="muted">
            {total
              ? `${due.length} to review and ${fresh.length} new from ${levelName(s.level)}.`
              : 'Come back tomorrow, or practise writing on the Draw page.'}
          </p>
          </div>
          <button className="primary" onClick={onStart} disabled={!total}>
            Start session
          </button>
        </div>
      </section>

      <section className="sheet" aria-label={`${levelName(s.level)} progress`}>
        <div className="sheet-head">
          <div className="levels" role="tablist" aria-label="HSK level">
            {LEVELS.map((l) => (
              <button
                key={l}
                role="tab"
                aria-selected={s.level === l}
                className={`level ${s.level === l ? 'level-on' : ''}`}
                onClick={() => setLevel(l)}
              >
                {l === 7 ? '7–9' : l}
              </button>
            ))}
          </div>
          <p className="muted sheet-stats">
            {started} of {inLevel.length} words started, {known} learned well
          </p>
        </div>
        {/* Каждый квадратик — одно слово уровня; цвет показывает, насколько хорошо оно выучено. */}
        {/* Each little square is one word of the level; its color shows how well it is learned. */}
        <div className="sheet-grid">
          {inLevel.map((w) => (
            <span key={w.h} className={`dot dot-${strength(s.cards[w.h])}`} title={`${w.h} ${w.p}`} />
          ))}
        </div>
        <div className="legend muted">
          <span><i className="dot dot-0" /> new</span>
          <span><i className="dot dot-1" /> seen</span>
          <span><i className="dot dot-2" /> learning</span>
          <span><i className="dot dot-3" /> known</span>
          <span><i className="dot dot-4" /> solid</span>
        </div>
      </section>
    </div>
  )
}
