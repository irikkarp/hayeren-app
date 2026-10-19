// Справочник букв восточноармянского алфавита (39 букв в школьном порядке, включая `ու` и `և`).
// Источник: таблица схемы hayeren-latin-v1 в docs/content/README.md.
export interface Letter {
  upper: string
  /** У `և` заглавной формы нет. */
  lower: string
  translit: string
  /** Уточнение для букв, чтение которых зависит от позиции. */
  note?: string
  /** Как читать, по-русски. */
  hint: string
}

export const ALPHABET: readonly Letter[] = [
  { upper: 'Ա', lower: 'ա', translit: 'a', hint: 'а' },
  { upper: 'Բ', lower: 'բ', translit: 'b', hint: 'б' },
  { upper: 'Գ', lower: 'գ', translit: 'g', hint: 'г' },
  { upper: 'Դ', lower: 'դ', translit: 'd', hint: 'д' },
  {
    upper: 'Ե',
    lower: 'ե',
    translit: 'ye / e',
    note: 'ye в начале слова, иначе e',
    hint: 'йе / е',
  },
  { upper: 'Զ', lower: 'զ', translit: 'z', hint: 'з' },
  { upper: 'Է', lower: 'է', translit: 'e', hint: 'э' },
  { upper: 'Ը', lower: 'ը', translit: 'ə', hint: 'безударный «ы/э», краткий' },
  { upper: 'Թ', lower: 'թ', translit: "t'", hint: 'т с придыханием' },
  { upper: 'Ժ', lower: 'ժ', translit: 'zh', hint: 'ж' },
  { upper: 'Ի', lower: 'ի', translit: 'i', hint: 'и' },
  { upper: 'Լ', lower: 'լ', translit: 'l', hint: 'л' },
  { upper: 'Խ', lower: 'խ', translit: 'kh', hint: 'х' },
  { upper: 'Ծ', lower: 'ծ', translit: 'ts', hint: 'ц (без придыхания)' },
  { upper: 'Կ', lower: 'կ', translit: 'k', hint: 'к (без придыхания)' },
  { upper: 'Հ', lower: 'հ', translit: 'h', hint: 'лёгкое «х», как англ. h' },
  { upper: 'Ձ', lower: 'ձ', translit: 'dz', hint: 'дз' },
  { upper: 'Ղ', lower: 'ղ', translit: 'gh', hint: 'гортанное «г», близко к французскому r' },
  { upper: 'Ճ', lower: 'ճ', translit: 'ch', hint: 'ч (без придыхания)' },
  { upper: 'Մ', lower: 'մ', translit: 'm', hint: 'м' },
  { upper: 'Յ', lower: 'յ', translit: 'y', hint: 'й' },
  { upper: 'Ն', lower: 'ն', translit: 'n', hint: 'н' },
  { upper: 'Շ', lower: 'շ', translit: 'sh', hint: 'ш' },
  {
    upper: 'Ո',
    lower: 'ո',
    translit: 'vo / o',
    note: 'vo в начале слова, иначе o',
    hint: 'во / о',
  },
  { upper: 'Չ', lower: 'չ', translit: "ch'", hint: 'ч с придыханием' },
  { upper: 'Պ', lower: 'պ', translit: 'p', hint: 'п (без придыхания)' },
  { upper: 'Ջ', lower: 'ջ', translit: 'j', hint: 'дж' },
  { upper: 'Ռ', lower: 'ռ', translit: 'rr', hint: 'раскатистое р' },
  { upper: 'Ս', lower: 'ս', translit: 's', hint: 'с' },
  { upper: 'Վ', lower: 'վ', translit: 'v', hint: 'в' },
  { upper: 'Տ', lower: 'տ', translit: 't', hint: 'т (без придыхания)' },
  { upper: 'Ր', lower: 'ր', translit: 'r', hint: 'р (одноударное)' },
  { upper: 'Ց', lower: 'ց', translit: "ts'", hint: 'ц с придыханием' },
  { upper: 'ՈՒ', lower: 'ու', translit: 'u', hint: 'у' },
  { upper: 'Փ', lower: 'փ', translit: "p'", hint: 'п с придыханием' },
  { upper: 'Ք', lower: 'ք', translit: "k'", hint: 'к с придыханием' },
  {
    upper: '',
    lower: 'և',
    translit: 'yev / ev',
    note: 'yev в начале слова, иначе ev',
    hint: 'йев / ев',
  },
  { upper: 'Օ', lower: 'օ', translit: 'o', hint: 'о' },
  { upper: 'Ֆ', lower: 'ֆ', translit: 'f', hint: 'ф' },
]
