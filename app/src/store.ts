// Хранилище прогресса: какие слова выучены, когда их повторять и уровень HSK.
// Всё лежит в localStorage браузера — сервер и регистрация не нужны.
// Progress storage: learned words, when to review them and the chosen HSK level.
// Everything lives in the browser's localStorage, so no server or sign-up is needed.
import { useSyncExternalStore } from 'react'
import { DefaultScheduler, Rating, type Grade } from 'ts-fsrs'

// Состояние памяти по одной карточке (как его хранит ts-fsrs, даты — строками).
// Memory state of one card, as ts-fsrs keeps it (dates stored as strings).
type StoredCard = Record<string, unknown> & { dueAt: string; state: number; stability: number; reps: number }

type State = {
  level: number
  newPerDay: number
  cards: Record<string, StoredCard>
  // сколько слов прошёл за день, ключ ГГГГ-ММ-ДД / words studied per day, keyed YYYY-MM-DD
  days: Record<string, { reviewed: number; learned: number }>
}

const KEY = 'mo.v1'
const initial: State = { level: 1, newPerDay: 10, cards: {}, days: {} }

// Читаю сохранённый прогресс; если его нет или браузер не даёт доступ — начинаю с нуля.
// I read saved progress; if there is none or the browser blocks storage, I start fresh.
function read(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...initial, ...JSON.parse(raw) } : initial
  } catch {
    return initial
  }
}

let state = read()
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // в режиме инкогнито прогресс живёт только до закрытия вкладки
    // in private mode progress lasts only until the tab is closed
  }
  listeners.forEach((l) => l())
}

// Хук для React: экран перерисовывается, когда прогресс меняется.
// React hook: the screen re-renders when progress changes.
export function useStore() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

export const today = () => new Date().toLocaleDateString('sv-SE')

export function setLevel(level: number) {
  set({ ...state, level })
}

export function resetProgress() {
  set({ ...initial, level: state.level })
}

// Планировщик FSRS — алгоритм интервальных повторений: показывает слово тогда, когда ты вот-вот его забудешь.
// FSRS scheduler — a spaced repetition algorithm: it shows a word right before you would forget it.
const scheduler = await DefaultScheduler({ enableFuzz: true })

// Из localStorage даты приходят строками, а FSRS нужны настоящие Date.
// Dates come back from localStorage as strings, but FSRS needs real Date objects.
function revive(card: StoredCard) {
  return {
    ...card,
    dueAt: new Date(card.dueAt),
    lastReviewAt: card.lastReviewAt ? new Date(card.lastReviewAt as string) : null,
  }
}

// Когда слово появится снова при каждой из четырёх оценок — подписи под кнопками.
// When the word comes back for each of the four grades — the labels under the buttons.
export function preview(word: string) {
  const now = new Date()
  const stored = state.cards[word]
  const card = stored ? revive(stored) : scheduler.newCard({ now })
  const out: Record<number, Date> = {}
  for (const p of scheduler.preview({ card: card as never, now })) {
    out[p.grade] = new Date((p.card as { dueAt: Date }).dueAt)
  }
  return out
}

// Записываю оценку и считаю статистику за день.
// I save the grade and count today's stats.
export function grade(word: string, g: Grade) {
  const now = new Date()
  const stored = state.cards[word]
  const card = stored ? revive(stored) : scheduler.newCard({ now })
  const result = scheduler.review({ card: card as never, grade: g, now })
  const day = state.days[today()] ?? { reviewed: 0, learned: 0 }
  set({
    ...state,
    cards: { ...state.cards, [word]: JSON.parse(JSON.stringify(result.card)) },
    days: {
      ...state.days,
      [today()]: stored ? { ...day, reviewed: day.reviewed + 1 } : { ...day, learned: day.learned + 1 },
    },
  })
}

export { Rating }

// Насколько хорошо знаю слово: 0 — новое, 4 — твёрдо. Для «листа прогресса» на главной.
// How well a word is known: 0 is new, 4 is solid. Used by the progress sheet on the home screen.
export function strength(card: StoredCard | undefined) {
  if (!card || card.reps === 0) return 0
  const s = card.stability
  if (s < 2) return 1
  if (s < 10) return 2
  if (s < 40) return 3
  return 4
}

// Перевожу дату в короткую подпись: «10 min», «4 d», «2 mo».
// Turns a date into a short label: "10 min", "4 d", "2 mo".
export function formatDue(date: Date, now = new Date()) {
  const min = (date.getTime() - now.getTime()) / 60000
  if (min < 60) return `${Math.max(1, Math.round(min))} min`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} h`
  const d = h / 24
  if (d < 31) return `${Math.round(d)} d`
  if (d < 365) return `${Math.round(d / 30)} mo`
  return `${(d / 365).toFixed(1)} y`
}
