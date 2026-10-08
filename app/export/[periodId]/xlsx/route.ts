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
  calc.addRow([data.subtitle])
  calc.addRow([data.stand]).font = { bold: true }
  for (const f of data.facts) calc.addRow([f])
  calc.addRow([])
  header(calc.addRow(calcHeader(data.lecture)))
  const toDate = (iso: string) => new Date(iso + 'T00:00:00Z')
  for (const r of data.calc.rows) {
    const row = calc.addRow([
      r.staff.name,
      r.staff.hours_per_week,
      toDate(r.from),
      toDate(r.to),
      r.workdays,
      r.weighted,
      r.share,
      r.target,
      r.targetRounded,
      ...(data.lecture ? [r.perWeekTarget ?? 0, r.perWeekAssigned ?? 0] : []),
      r.assigned,
      r.delta,
    ])
    row.eachCell((c) => (c.border = border))
  }
  // Spaltenformate: 3/4 Datum, 6 gewichtet, 7 Anteil, 8 Soll, (10 Soll/Woche), letzte = Differenz
  const cols = calcHeader(data.lecture).length
  calc.getColumn(3).numFmt = 'dd.mm.yyyy'
  calc.getColumn(4).numFmt = 'dd.mm.yyyy'
  calc.getColumn(6).numFmt = '0.0'
  calc.getColumn(7).numFmt = '0.0 %'
  calc.getColumn(8).numFmt = '0.0'
  if (data.lecture) calc.getColumn(10).numFmt = '0.0'
  calc.getColumn(cols).numFmt = '+0.0;-0.0;0.0'
  calc.columns.forEach((c, i) => (c.width = i === 0 ? 20 : 13))

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(data.fileName, 'xlsx'),
      'Cache-Control': 'no-store',
    },
  })
}
