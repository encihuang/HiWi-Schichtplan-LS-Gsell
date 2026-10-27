import ExcelJS from 'exceljs'
import { APP_TITLE, CHAIR } from '@/lib/brand'
import { calcHeader, contentDisposition, loadExport } from '@/lib/export'
import { AVAILABILITY_LABELS } from '@/lib/data'
import { currentStaff } from '@/lib/session'
import { canSeePlan } from '@/lib/data'

const GREEN = 'FF00883A'
const AVAILABILITY_ARGB = { ok: 'FF8CC152', ungern: 'FFF2A24B', nein: 'FFEC5A3F' } as const
const thin = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

export async function GET(_: Request, ctx: RouteContext<'/export/[periodId]/xlsx'>) {
  const me = await currentStaff()
  if (!me) return new Response('Bitte anmelden.', { status: 401 })
  if (!canSeePlan(me)) return new Response('Kein Zugriff auf den Schichtplan.', { status: 403 })
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
  body.forEach((r, ri) => {
    const row = ws.addRow(r)
    const lines = Math.max(...r.map((v) => v.split('\n').length))
    row.height = Math.max(data.lecture ? 24 : 32, lines * 14)
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { horizontal: data.lecture ? 'left' : 'center', vertical: 'middle', wrapText: true }
      c.border = border
      if (col === 1) c.font = { bold: true }
      const status = data.gridStatus?.[ri + 1]?.[col - 1]
      if (status) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AVAILABILITY_ARGB[status] } }
    })
  })
  if (data.gridStatus) {
    ws.addRow([])
    for (const [k, label] of Object.entries(AVAILABILITY_LABELS) as [keyof typeof AVAILABILITY_ARGB, string][]) {
      const row = ws.addRow(['', label])
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AVAILABILITY_ARGB[k] } }
    }
  }
  for (const t of data.extra) {
    ws.addRow([])
    ws.addRow([t.title]).font = { bold: true, size: 12 }
    const [th, ...tb] = t.grid
    header(ws.addRow(th))
    for (const r of tb) {
      const row = ws.addRow(r)
      row.height = Math.max(18, Math.max(...r.map((v) => v.split('\n').length)) * 14)
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.alignment = { vertical: 'middle', wrapText: true }
        c.border = border
        if (col === 1) c.font = { bold: true }
      })
    }
  }
  ws.getColumn(1).width = data.lecture ? 24 : 8
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

  const contacts = Object.entries(data.emails)
  if (contacts.length) {
    const k = wb.addWorksheet('Kontakte')
    header(k.addRow(['Name', 'E-Mail']))
    for (const [name, email] of contacts) {
      const row = k.addRow([name, { text: email, hyperlink: `mailto:${email}` }])
      row.getCell(2).font = { color: { argb: 'FF006A2D' }, underline: true }
    }
    k.getColumn(1).width = 20
    k.getColumn(2).width = 36
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(data.fileName, 'xlsx'),
      'Cache-Control': 'no-store',
    },
  })
}
