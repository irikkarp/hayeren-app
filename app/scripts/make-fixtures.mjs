// Генерирует файлы для e2e-тестов импорта в e2e/fixtures: node scripts/make-fixtures.mjs
// XLSX собирается вручную (zip из XML), чтобы не тянуть библиотеку записи Excel.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'fixtures')
mkdirSync(out, { recursive: true })
const write = (name, data) => writeFileSync(join(out, name), data)

// --- CSV ---------------------------------------------------------------------------------
// Как сохраняет русский Excel: UTF-8 с BOM, разделитель «;», CRLF, заголовки по-русски.
write(
  'lesson-semicolon.csv',
  '﻿' +
    [
      'Слово;Перевод;Произношение;Заметки',
      'բարև;привет;;приветствие',
      'շնորհակալություն;спасибо;;',
      'լավ, բարի;хорошо, добрый;lav bari;',
      'ջուր;вода;jur;',
      'հաց;хлеб;;',
    ].join('\r\n') +
    '\r\n',
)

// Табуляция, без заголовков, первая колонка — номера; есть строка без перевода и пустая строка.
write(
  'lesson-tab-noheader.csv',
  ['1\tկաթ\tмолоко', '2\tսուրճ\tкофе', '', '3\tթեյ\t', '4\tշուկա\tрынок'].join('\n') + '\n',
)

// Формат будущего экспорта (критерии 92–95): BOM, «;», CRLF, кавычки, апостроф перед «-».
write(
  'backup-format.csv',
  '﻿' +
    [
      'set;hy;ru;translit;example_hy;example_ru',
      'Урок 5;բարև;привет;;;',
      'Урок 5;տուն;"дом, жильё;\r\nещё ""дом""";tun;Տունը մեծ է։;Дом большой.',
      "Урок 5;եւ;\'-ый суффикс;;;",
      'Кухня и еда;հաց;хлеб;;;',
      'Кухня и еда;ջուր;вода;jur;;',
    ].join('\r\n') +
    '\r\n',
)

// Windows-1251: «привет» — не UTF-8, импорт должен отказаться.
write('cp1251.csv', Buffer.from([0xef, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x3b, 0x31, 0x0d, 0x0a]))

// Старый формат: расширение .xls отклоняется по имени, содержимое не важно.
write('old-format.xls', Buffer.from('not really an xls'))

// --- XLSX --------------------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const colName = (i) => String.fromCharCode(65 + i)

function sheetXml(rows, strings) {
  const sst = (s) => {
    let i = strings.indexOf(s)
    if (i < 0) i = strings.push(s) - 1
    return i
  }
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`
          if (v === null || v === '') return ''
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
          if (typeof v === 'object')
            return `<c r="${ref}" t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>` // формула и её текстовый результат
          return `<c r="${ref}" t="s"><v>${sst(v)}</v></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function xlsx(sheets) {
  const strings = []
  const sheetFiles = sheets.map((s) => sheetXml(s.rows, strings))
  const files = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join(
          '',
        )}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
  }
  sheetFiles.forEach((xml, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml)))
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
      .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
      .join('')}</sst>`,
  )
  return Buffer.from(zipSync(files))
}

// Два листа (первый импортируется, критерий 73); число в ячейке и формула с готовым результатом.
write(
  'lesson.xlsx',
  xlsx([
    {
      name: 'Урок 7',
      rows: [
        ['hy', 'ru', 'translit', 'example_hy'],
        ['բարի առավոտ', 'доброе утро', '', 'Բարի առավոտ, Արամ։'],
        ['գիշեր', 'ночь', 'gisher', ''],
        ['երկու', 2, '', ''],
        ['տասը', { f: '"де"&"сять"', v: 'десять' }, '', ''],
      ],
    },
    { name: 'Черновик', rows: [['x', 'y']] },
  ]),
)
console.log('Фикстуры записаны в', out)
