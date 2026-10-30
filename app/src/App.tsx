// Оболочка приложения: меню слева (на телефоне — снизу) и переключение экранов.
// The app shell: the menu on the left (at the bottom on phones) and switching between screens.
import { useEffect, useState } from 'react'
import { loadWords, type Word } from './data'
import { Today } from './screens/Today'
import { Session } from './screens/Session'
import { Draw } from './screens/Draw'
import { Words } from './screens/Words'

// Иконки вкладок — сами иероглифы: 今 «сегодня», 写 «писать», 词 «слово».
// Tab icons are characters: 今 "today", 写 "write", 词 "word".
type Tab = 'today' | 'draw' | 'words'
const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'today', label: 'Today', glyph: '今' },
  { id: 'draw', label: 'Draw', glyph: '写' },
  { id: 'words', label: 'Words', glyph: '词' },
]

// Вкладку запоминаю в адресе (#draw, #words), чтобы можно было дать ссылку прямо на экран.
// The tab lives in the address (#draw, #words) so you can link straight to a screen.
function initialTab(): Tab {
  const h = location.hash.slice(1)
  return h === 'draw' || h === 'words' ? h : 'today'
}

export default function App() {
  const [words, setWords] = useState<Word[] | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [studying, setStudying] = useState(false)

  useEffect(() => {
    loadWords().then(setWords)
    const onHash = () => (setTab(initialTab()), setStudying(false))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    history.replaceState(null, '', tab === 'today' ? location.pathname : `#${tab}`)
  }, [tab])

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <a className="brand" href="#" onClick={(e) => (e.preventDefault(), setTab('today'), setStudying(false))}>
          <span className="brand-mark" lang="zh-CN">墨</span>
          <span className="brand-name">Mo</span>
        </a>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'tab-on' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => (setTab(t.id), setStudying(false))}
            >
              <span className="tab-glyph" lang="zh-CN" aria-hidden="true">{t.glyph}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="main">
        {!words ? (
          <p className="muted loading">Loading 10,969 HSK words…</p>
        ) : tab === 'today' ? (
          studying ? <Session words={words} onExit={() => setStudying(false)} /> : <Today words={words} onStart={() => setStudying(true)} />
        ) : tab === 'draw' ? (
          <Draw words={words} />
        ) : (
          <Words words={words} />
        )}
      </main>
    </div>
  )
}
