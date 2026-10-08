import ExcelJS from 'exceljs'
import { APP_TITLE, CHAIR } from '@/lib/brand'
import { calcHeader, contentDisposition, loadExport } from '@/lib/export'
import { currentStaff } from '@/lib/session'

const GREEN = 'FF00883A'
const thin = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

export async function GET(_: Request, ctx: RouteContext<'/export/[periodId]/xlsx'>) {
  if (!(await currentStaff())) return new Response('Bitte zuerst auswählen, wer du bist.', { status: 401 })
  const data = await loadExport(Number((await ctx.params).periodId))
  if (!data) return new Response('Nicht gefunden', { status: 404 })

  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet('Schichtplan', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  ws.addRow([APP_TITLE]).font = { bold: true, size: 14, color: { argb: 'FF004D21' } }
  ws.addRow([CHAIR]).font = { size: 9, color: { argb: 'FF555555' } }
  ws.addRow([])
  ws.addRow([data.title]).font = { bold: true, size: 12 }
  ws.addRow([data.subtitle])
  ws.addRow([data.stand]).font = { bold: true }
  ws.addRow([data.lastChange]).font = { italic: true, color: { argb: 'FF555555' } }
  ws.addRow([])

  const header = (row: ExcelJS.Row) => {
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = border
    })
  }

  const [head, ...body] = data.grid
  header(ws.addRow(head))
  for (const r of body) {
    const row = ws.addRow(r)
    row.height = data.lecture ? 28 : 32
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { horizontal: col === 1 && data.lecture ? 'left' : 'center', vertical: 'middle', wrapText: true }
      c.border = border
      if (col === 1) c.font = { bold: true }
    })
  }
  ws.getColumn(1).width = data.lecture ? 20 : 6
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 20

  const calc = wb.addWorksheet('Berechnung')
  calc.addRow([data.title]).font = { bold: true, size: 12 }
  calc.addRow([data.stand]).font = { bold: true }
  calc.addRow([])
  header(calc.addRow(calcHeader(data.lecture)))
  for (const r of data.calc) {
    const row = calc.addRow([
      r.staff.name,
      r.staff.hours_per_week,
      ...(data.lecture ? [] : [r.workdays]),
      r.share,
      r.target,
      r.assigned,
      r.delta,
    ])
    row.eachCell((c) => (c.border = border))
  }
  const off = data.lecture ? 0 : 1
  calc.getColumn(3 + off).numFmt = '0.0 %'
  calc.getColumn(4 + off).numFmt = '0.0'
  calc.getColumn(6 + off).numFmt = '+0.0;-0.0;0.0'
  calc.columns.forEach((c, i) => (c.width = i === 0 ? 20 : 15))

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(data.fileName, 'xlsx'),
      'Cache-Control': 'no-store',
    },
  })
}
