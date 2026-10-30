# 墨 Mo — тренажёр иероглифов HSK с распознаванием почерка

**[RU](#ru) | [EN](#en)**

---

<a id="ru"></a>

## RU

Я учу китайский и собираюсь поступать в университет в Китае. Мне нужен был тренажёр под новый
экзамен HSK 3.0, где можно не только листать карточки, но и писать иероглифы рукой. Поэтому я
сделал Mo.

### Что умеет

- **Карточки по HSK 3.0.** Все 10 969 слов уровней 1–9: иероглифы, пиньинь, значения, озвучка.
- **Интервальные повторения (FSRS).** Слово возвращается тогда, когда ты вот-вот его забудешь.
  После каждой оценки видно, через сколько оно появится снова.
- **Порядок черт и письмо.** Анимация, как пишется каждый иероглиф. Можно написать его самому, и
  программа проверит каждую черту.
- **Распознавание почерка нейросетью.** Рисуешь иероглиф пальцем или мышью, и сеть угадывает,
  какой из 2 970 иероглифов HSK это был. Сеть работает прямо в браузере, на сервер ничего не
  уходит.
- **Лист прогресса.** Каждое слово уровня — квадратик; цвет показывает, насколько хорошо оно
  выучено.
- Работает на компьютере и на телефоне, есть светлая и тёмная тема. Регистрация не нужна:
  прогресс хранится в браузере.

### Как я обучил нейросеть без базы почерков

Обычно для распознавания почерка берут большую базу рукописных иероглифов. Свободных баз под
нужную лицензию я не нашёл, поэтому сделал по-другому: обучающие картинки рисует сама программа.

1. Беру средние линии черт каждого иероглифа из открытого проекта Make Me a Hanzi.
2. Прямо на видеокарте искажаю их «как рукой»: каждая черта сдвигается и масштабируется отдельно,
   точки дрожат, весь иероглиф поворачивается и наклоняется, толщина линии меняется.
3. Рисую результат в картинку 64×64. Каждый раз она новая, поэтому сеть ни разу не видит одну и
   ту же картинку дважды.
4. В браузере рисунок пользователя обрабатывается точно так же (`app/src/recognizer.ts`), поэтому
   сеть получает привычные для себя картинки.

Сеть — свёрточная, около 5 млн параметров, 4 блока по две свёртки 3×3. Обучение — `ml/train.py`
(PyTorch), потом экспорт в ONNX и запуск в браузере через ONNX Runtime Web. Посмотреть обучающие
картинки глазами — `ml/preview.py`.

### Из чего сделано

| Часть | Технологии |
|---|---|
| Приложение | React 19, TypeScript, Vite |
| Повторения | ts-fsrs (алгоритм FSRS) |
| Порядок черт | Hanzi Writer |
| Нейросеть | PyTorch → ONNX → onnxruntime-web |
| Данные | complete-hsk-vocabulary (MIT), Make Me a Hanzi (Arphic PL / LGPL) |

### Как запустить

```bash
cd app
npm install
npm run dev
```

Пересобрать данные из исходников: `python scripts/build_data.py`.
Обучить сеть (нужна видеокарта NVIDIA): `python ml/train.py --steps 30000`.

### Структура

```
app/            приложение (React)
  src/screens/  экраны: Today, Session, Draw, Words
  public/       словарь, черты иероглифов, модель
ml/             обучение нейросети
scripts/        сборка данных
data-src/       исходные данные
licenses/       лицензии чужих данных
```

---

<a id="en"></a>

## EN

I'm learning Chinese and plan to study at a university in China. I wanted a trainer built for
the new HSK 3.0 exam where you don't just flip cards but actually write characters by hand, so I
built Mo.

### Features

- **HSK 3.0 flashcards.** All 10,969 words of levels 1–9 with hanzi, pinyin, meanings and audio.
- **Spaced repetition (FSRS).** A word comes back right before you would forget it. Each grade
  shows when the word will return.
- **Stroke order and writing.** An animation shows how each character is written. You can write
  it yourself and every stroke is checked.
- **Handwriting recognition.** Draw a character with a finger or mouse and a neural network
  guesses which of the 2,970 HSK characters it is. It runs in the browser; nothing is sent to a
  server.
- **Progress sheet.** Every word of a level is a small square colored by how well it is learned.
- Works on desktop and phone, light and dark theme. No sign-up: progress is stored in the browser.

### How I trained the network without a handwriting dataset

Handwriting recognizers are usually trained on a large dataset of handwritten characters. I
couldn't find a free one with a suitable license, so the program draws its own training images.

1. I take the stroke medians of every character from the open Make Me a Hanzi project.
2. On the GPU I distort them like a human hand would: each stroke shifts and scales on its own,
   points wobble, the whole character rotates and tilts, and line width changes.
3. I rasterize the result into a 64×64 image. It is different every time, so the network never
   sees the same image twice.
4. The browser processes the user's drawing exactly the same way (`app/src/recognizer.ts`), so
   the network gets the kind of image it was trained on.

The network is a CNN with about 5M parameters: 4 blocks of two 3×3 convolutions. Training is in
`ml/train.py` (PyTorch); the model is exported to ONNX and runs in the browser with ONNX Runtime
Web. To look at training images, run `ml/preview.py`.

### Built with

| Part | Technology |
|---|---|
| App | React 19, TypeScript, Vite |
| Repetition | ts-fsrs (FSRS algorithm) |
| Stroke order | Hanzi Writer |
| Neural network | PyTorch → ONNX → onnxruntime-web |
| Data | complete-hsk-vocabulary (MIT), Make Me a Hanzi (Arphic PL / LGPL) |

### Run it

```bash
cd app
npm install
npm run dev
```

Rebuild data from sources: `python scripts/build_data.py`.
Train the network (needs an NVIDIA GPU): `python ml/train.py --steps 30000`.
