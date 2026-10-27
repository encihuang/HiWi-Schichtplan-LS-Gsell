import { jsPDF } from 'jspdf'
import { autoTable, type CellHookData } from 'jspdf-autotable'
import { APP_TITLE, CHAIR } from '@/lib/brand'
import { calcHeader, calcRowsText, contentDisposition, loadExport } from '@/lib/export'
import { AVAILABILITY_RGB } from '@/lib/plan-styles'
import { AVAILABILITY_LABELS } from '@/lib/data'
import { currentStaff } from '@/lib/session'
import { canSeePlan } from '@/lib/data'

const GREEN: [number, number, number] = [0, 136, 58]

export async function GET(_: Request, ctx: RouteContext<'/export/[periodId]/pdf'>) {
  const me = await currentStaff()
  if (!me) return new Response('Bitte anmelden.', { status: 401 })
  if (!canSeePlan(me)) return new Response('Kein Zugriff auf den Schichtplan.', { status: 403 })
  const data = await loadExport(Number((await ctx.params).periodId))
  if (!data) return new Response('Nicht gefunden', { status: 404 })

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  // Namen in Tabellenzellen als mailto-Link mit Briefumschlag (Name am Zeilenanfang, ggf. nach „! “)
  const names = Object.keys(data.emails).sort((a, b) => b.length - a.length)
  const nameAt = (line: string) => {
    const lead = line.startsWith('! ') ? '! ' : ''
    const name = names.find((n) => line.slice(lead.length).startsWith(n))
    return name ? { lead, name } : null
  }
  const iconSize = (fontSize: number) => {
    const h = (fontSize / doc.internal.scaleFactor) * 0.62
    return { w: h * 1.45, h }
  }
  // Platz für das Symbol hinter dem Namen schaffen (vor der Breitenberechnung)
  const makeRoom = (h: CellHookData) => {
    if (h.section !== 'body' || !names.length) return
    doc.setFontSize(h.cell.styles.fontSize)
    const spaces = ' '.repeat(Math.ceil((iconSize(h.cell.styles.fontSize).w + 1.2) / doc.getTextWidth(' ')))
    h.cell.text = h.cell.text.map((line) => {
      const m = nameAt(line)
      return m ? m.lead + m.name + spaces + line.slice(m.lead.length + m.name.length) : line
    })
  }
  const linkNames = (h: CellHookData) => {
    if (h.section !== 'body' || !names.length) return
    const c = h.cell
    const lh = (c.styles.fontSize * doc.getLineHeightFactor()) / doc.internal.scaleFactor
    const block = c.text.length * lh
    const top =
      c.styles.valign === 'middle'
        ? c.y + (c.height - block) / 2
        : c.styles.valign === 'bottom'
          ? c.y + c.height - c.padding('bottom') - block
          : c.y + c.padding('top')
    doc.setFontSize(c.styles.fontSize)
    const icon = iconSize(c.styles.fontSize)
    c.text.forEach((line, i) => {
      const m = nameAt(line)
      if (!m) return
      const lineW = doc.getTextWidth(line)
      const x0 =
        c.styles.halign === 'center'
          ? c.x + (c.width - lineW) / 2
          : c.styles.halign === 'right'
            ? c.x + c.width - c.padding('right') - lineW
            : c.x + c.padding('left')
      const x = x0 + doc.getTextWidth(m.lead)
      const w = doc.getTextWidth(m.name)
      const y = top + i * lh
      // Briefumschlag
      const ix = x + w + 0.7
      const iy = y + (lh - icon.h) / 2
      doc.setDrawColor(...GREEN).setLineWidth(0.25)
      doc.rect(ix, iy, icon.w, icon.h, 'S')
      doc.lines([[icon.w / 2, icon.h * 0.55], [icon.w / 2, -icon.h * 0.55]], ix, iy, [1, 1], 'S')
      doc.link(x, y, w + 0.7 + icon.w, lh, { url: `mailto:${data.emails[m.name]}` })
    })
  }

  // fünf gleich breite Wochentagsspalten neben der ersten Spalte
  const dayCols = (first: number) =>
    Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, { cellWidth: (W - 2 * M - first) / 5 }]))

  doc.setFillColor(...GREEN)
  doc.rect(0, 0, W, 4, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(0, 77, 33)
  doc.text(APP_TITLE, M, 14)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(80)
  doc.text(doc.splitTextToSize(CHAIR.replace('–', '-'), W - 2 * M), M, 19)
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0)
  doc.text(data.title, M, 29)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(data.subtitle, M, 34.5)
  doc.setFont('helvetica', 'bold').text(data.stand, W - M, 29, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90)
  doc.text(data.lastChange, W - M, 34.5, { align: 'right' })

  const [head, ...body] = data.grid
  autoTable(doc, {
    didDrawCell: linkNames,
    willDrawCell: makeRoom,
    startY: 40,
    head: [head],
    body,
    theme: 'grid',
    margin: { left: M, right: M },
    styles: { fontSize: data.lecture ? 9.5 : 8.5, cellPadding: data.lecture ? 2.5 : 1.6, valign: 'middle', lineColor: 200 },
    headStyles: { fillColor: GREEN, textColor: 255, halign: 'center' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: data.lecture ? 32 : 12, halign: data.lecture ? 'left' : 'center' },
      ...dayCols(data.lecture ? 32 : 12),
    },
    bodyStyles: { halign: data.lecture ? 'left' : 'center' },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return
      const status = data.gridStatus?.[cell.row.index + 1]?.[cell.column.index]
      if (status) cell.cell.styles.fillColor = AVAILABILITY_RGB[status]
      if (data.lecture && cell.row.index === body.length - 1) {
        cell.cell.styles.fillColor = [229, 243, 235]
        cell.cell.styles.fontSize = 8
      }
    },
  })

  if (data.gridStatus) {
    let x = M
    const ly = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4.5
    doc.setFontSize(7.5).setTextColor(80)
    for (const [k, label] of Object.entries(AVAILABILITY_LABELS) as [keyof typeof AVAILABILITY_RGB, string][]) {
      doc.setFillColor(...AVAILABILITY_RGB[k]).rect(x, ly - 2.6, 5, 3, 'F')
      doc.text(label, x + 6.5, ly)
      x += doc.getTextWidth(label) + 13
    }
  }

  // weitere Tabellen (Abweichungen, Vorlesungen)
  for (const t of data.extra) {
    const prev = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    let ty = prev + 12
    if (ty + 20 > doc.internal.pageSize.getHeight() - 14) {
      doc.addPage()
      ty = 16
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0, 77, 33)
    doc.text(t.title, M, ty)
    const [th, ...tb] = t.grid
    autoTable(doc, {
    didDrawCell: linkNames,
    willDrawCell: makeRoom,
      startY: ty + 3,
      head: [th],
      body: tb,
      theme: 'grid',
      margin: { left: M, right: M },
      styles: { fontSize: t.title === 'Kalender' ? 7.5 : 8.5, cellPadding: 1.8, lineColor: 200 },
      headStyles: { fillColor: GREEN, textColor: 255 },
      columnStyles:
        t.title === 'Kalender'
          ? { 0: { fontStyle: 'bold', cellWidth: 12, halign: 'center' }, ...dayCols(12) }
          : { 0: { fontStyle: 'bold' } },
      didParseCell: (cell) => {
        const text = cell.cell.text.join(' ')
        if (cell.section === 'body' && (text.includes('! ') || text.includes('offen') || text.endsWith('unbesetzt'))) {
          cell.cell.styles.fillColor = [253, 236, 200]
        }
      },
    })
  }

  // Berechnung nicht über zwei Seiten verteilen
  const afterPlan = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const needed = (data.calc.rows.length + 1) * 7 + 24
  const newPage = afterPlan + needed > doc.internal.pageSize.getHeight() - 14
  if (newPage) doc.addPage()
  let y = newPage ? 16 : afterPlan + 8
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0, 77, 33)
  doc.text('Berechnung', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(60)
  for (const line of data.facts) {
    const wrapped = doc.splitTextToSize(line, W - 2 * M)
    doc.text(wrapped, M, (y += 5))
    y += (wrapped.length - 1) * 3.6
  }

  autoTable(doc, {
    didDrawCell: linkNames,
    willDrawCell: makeRoom,
    startY: y + 3,
    head: [calcHeader(data.lecture).map((h, i) => ({ content: h, styles: { halign: i ? 'right' : 'left' } as const }))],
    body: calcRowsText(data.calc.rows, data.lecture),
    theme: 'striped',
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { fillColor: GREEN, textColor: 255 },
    alternateRowStyles: { fillColor: [243, 249, 245] },
    columnStyles: { 0: { halign: 'left' } },
    bodyStyles: { halign: 'right' },
    showHead: 'everyPage',
    pageBreak: 'auto',
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8).setTextColor(120)
    doc.text(`${data.stand} · Seite ${i} von ${pages}`, W - M, doc.internal.pageSize.getHeight() - 7, { align: 'right' })
  }

  return new Response(doc.output('arraybuffer'), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(data.fileName, 'pdf'),
      'Cache-Control': 'no-store',
    },
  })
}
