import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { APP_TITLE, CHAIR } from '@/lib/brand'
import { calcHeader, calcRowsText, contentDisposition, loadExport } from '@/lib/export'
import { currentStaff } from '@/lib/session'

const GREEN: [number, number, number] = [0, 136, 58]

export async function GET(_: Request, ctx: RouteContext<'/export/[periodId]/pdf'>) {
  if (!(await currentStaff())) return new Response('Bitte zuerst auswählen, wer du bist.', { status: 401 })
  const data = await loadExport(Number((await ctx.params).periodId))
  if (!data) return new Response('Nicht gefunden', { status: 404 })

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14

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
    startY: 40,
    head: [head],
    body,
    theme: 'grid',
    margin: { left: M, right: M },
    styles: { fontSize: data.lecture ? 11 : 8.5, cellPadding: data.lecture ? 4 : 1.6, valign: 'middle', lineColor: 200 },
    headStyles: { fillColor: GREEN, textColor: 255, halign: 'center' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: data.lecture ? 40 : 12, halign: data.lecture ? 'left' : 'center' } },
    bodyStyles: { halign: 'center' },
  })

  // Berechnung nicht über zwei Seiten verteilen
  const afterPlan = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const needed = (data.calc.length + 1) * 7 + 10
  const newPage = afterPlan + needed > doc.internal.pageSize.getHeight() - 14
  if (newPage) doc.addPage()

  autoTable(doc, {
    startY: newPage ? 16 : afterPlan + 8,
    head: [calcHeader(data.lecture).map((h, i) => ({ content: h, styles: { halign: i ? 'right' : 'left' } as const }))],
    body: calcRowsText(data.calc, data.lecture),
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
