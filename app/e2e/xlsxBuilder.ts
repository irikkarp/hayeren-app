import { strToU8, zipSync } from 'fflate'

/** Ячейка: строка, число, формула с готовым результатом/без него, ошибка, булево, дата-серийное число со стилем. */
export type XCell =
  string | number | boolean | null | { f: string; v?: string } | { err: string } | { date: number }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const colName = (i: number) => String.fromCharCode(65 + i)

export interface XSheet {
  name: string
  rows: XCell[][]
  hidden?: boolean
}

/** Собирает минимальный .xlsx (zip из XML) для e2e-тестов; без библиотеки записи Excel. */
export function buildXlsx(sheets: XSheet[]): Buffer {
  const strings: string[] = []
  const sst = (s: string) => {
    let i = strings.indexOf(s)
    if (i < 0) i = strings.push(s) - 1
    return i
  }
  const sheetXml = (rows: XCell[][]) => {
    const body = rows
      .map((row, r) => {
        const cells = row
          .map((v, c) => {
            const ref = `${colName(c)}${r + 1}`
            if (v === null || v === '') return ''
            if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
            if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
            if (typeof v === 'object' && 'f' in v)
              return v.v === undefined
                ? `<c r="${ref}"><f>${esc(v.f)}</f></c>`
                : `<c r="${ref}" t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`
            if (typeof v === 'object' && 'err' in v)
              return `<c r="${ref}" t="e"><v>${esc(v.err)}</v></c>`
            if (typeof v === 'object' && 'date' in v)
              return `<c r="${ref}" s="1"><v>${v.date}</v></c>`
            return `<c r="${ref}" t="s"><v>${sst(v as string)}</v></c>`
          })
          .join('')
        return `<row r="${r + 1}">${cells}</row>`
      })
      .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
  }
  const sheetFiles = sheets.map((s) => sheetXml(s.rows))
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join(
          '',
        )}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets>${sheets
        .map(
          (s, i) =>
            `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`,
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
