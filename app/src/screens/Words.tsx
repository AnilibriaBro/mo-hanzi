// Экран «Words»: весь словарь HSK по уровням и поиск по иероглифам, пиньиню или переводу.
// The Words screen: the whole HSK list by level and search by hanzi, pinyin or meaning.
import { useDeferredValue, useMemo, useState } from 'react'
import { LEVELS, speak, type Word } from '../data'
import { strength, useStore } from '../store'

export function Words({ words }: { words: Word[] }) {
  const s = useStore()
  const [level, setLevel] = useState(s.level)
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim().toLowerCase())

  const list = useMemo(() => {
    if (!query) return words.filter((w) => w.l === level)
    // Убираю тоны, чтобы «nihao» находило «nǐ hǎo».
    // I strip tone marks so "nihao" finds "nǐ hǎo".
    const plain = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const pq = plain(query)
    return words.filter((w) => w.h.includes(query) || plain(w.p).replace(/\s/g, '').includes(pq.replace(/\s/g, '')) || w.m.toLowerCase().includes(query)).slice(0, 200)
  }, [words, level, query])

  return (
    <div className="words">
      <header className="words-head">
        <h1>Words</h1>
        <input
          type="search"
          className="search"
          placeholder="Search hanzi, pinyin or meaning"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search words"
        />
        {!query && (
          <div className="levels" role="tablist" aria-label="HSK level">
            {LEVELS.map((l) => (
              <button key={l} role="tab" aria-selected={level === l} className={`level ${level === l ? 'level-on' : ''}`} onClick={() => setLevel(l)}>
                {l === 7 ? '7–9' : l}
              </button>
            ))}
          </div>
        )}
      </header>
      <p className="muted small">{query ? `${list.length}${list.length === 200 ? '+' : ''} matches` : `${list.length} words`}</p>
      <ul className="wordlist">
        {list.slice(0, 400).map((w) => (
          <li key={w.h}>
            <button className="wordrow" onClick={() => speak(w.h)} title="Listen">
              <i className={`dot dot-${strength(s.cards[w.h])}`} />
              <span lang="zh-CN" className="wordrow-h">{w.h}</span>
              <span className="wordrow-p">{w.p}</span>
              <span className="wordrow-m">{w.m}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > 400 && <p className="muted small">Showing the first 400. Search to find the rest.</p>}
    </div>
  )
}
