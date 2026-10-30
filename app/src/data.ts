// Здесь загружаю словарь HSK, данные о чертах и озвучку.
// Here I load the HSK word list, stroke data and speech.

// Одно слово из словаря. Короткие имена полей — чтобы файл words.json весил меньше.
// One word from the list. Field names are short so words.json stays small.
export type Word = {
  h: string // иероглифы (упрощённые) / simplified hanzi
  p: string // пиньинь с тонами / pinyin with tone marks
  m: string // значения / meanings
  l: number // уровень HSK 3.0, 7 = уровни 7–9 / HSK 3.0 level, 7 means 7–9
  f: number // место по частоте / frequency rank
}

export const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const
export const levelName = (l: number) => (l === 7 ? 'HSK 7–9' : `HSK ${l}`)

const base = import.meta.env.BASE_URL

// Скачиваю словарь один раз и дальше беру из памяти.
// I download the word list once and reuse it after that.
let wordsPromise: Promise<Word[]> | null = null
export function loadWords(): Promise<Word[]> {
  wordsPromise ??= fetch(`${base}data/words.json`).then((r) => r.json())
  return wordsPromise
}

let charsPromise: Promise<Record<string, [string, string]>> | null = null
export function loadChars() {
  charsPromise ??= fetch(`${base}data/chars.json`).then((r) => r.json())
  return charsPromise
}

export function strokeUrl(char: string) {
  return `${base}strokes/${char.codePointAt(0)!.toString(16)}.json`
}

// Загрузчик для Hanzi Writer: берёт черты из моих файлов public/strokes/<код>.json.
// Loader for Hanzi Writer: reads strokes from my files public/strokes/<code>.json.
export function charDataLoader(char: string, onLoad: (data: unknown) => void, onError: (e?: unknown) => void) {
  fetch(strokeUrl(char))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`No strokes for ${char}`))))
    .then(onLoad, onError)
}

// Произношу слово китайским голосом браузера (если такой голос есть на устройстве).
// Reads a word aloud with the browser's Chinese voice, if the device has one.
export function speak(text: string) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return false
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh'))
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    if (voice) u.voice = voice
    u.rate = 0.85
    synth.cancel()
    synth.speak(u)
    return true
  } catch {
    return false
  }
}
