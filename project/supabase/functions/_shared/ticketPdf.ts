import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import QRCode from 'npm:qrcode@1.5.4'

export interface TicketPdfData {
  full_name: string
  phone: string
  quantity: number
  qr_token: string
  table_name: string
  table_price: number
}

export interface TicketPdfEvent {
  event_name: string
  event_date: string | null
  event_location: string
}

export async function createTicketPdf(ticket: TicketPdfData, event: TicketPdfEvent) {
  const document = await PDFDocument.create()
  const page = document.addPage([595, 842])
  const font = await document.embedFont(StandardFonts.Helvetica)
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold)
  const qrPng = await QRCode.toBuffer(ticket.qr_token, { type: 'png', width: 360, margin: 1 })
  const qrImage = await document.embedPng(qrPng)
  const date = event.event_date
    ? new Date(event.event_date).toLocaleDateString('fr-FR')
    : 'À préciser'
  const total = (ticket.table_price * ticket.quantity).toLocaleString('fr-FR')

  page.drawRectangle({ x: 28, y: 28, width: 539, height: 786, color: rgb(1, 0.992, 0.969), borderColor: rgb(0.72, 0.47, 0.12), borderWidth: 2 })
  page.drawRectangle({ x: 28, y: 770, width: 539, height: 44, color: rgb(0.18, 0.07, 0.04) })
  page.drawText(event.event_name, { x: 52, y: 785, size: 18, font: boldFont, color: rgb(1, 0.82, 0.45), maxWidth: 490 })
  page.drawText('BILLET OFFICIEL', { x: 52, y: 724, size: 13, font: boldFont, color: rgb(0.55, 0.34, 0.08) })

  const details = [
    ['Nom', ticket.full_name],
    ['Téléphone', ticket.phone],
    ['Date', date],
    ['Lieu', event.event_location || 'À préciser'],
    ['Table', ticket.table_name || 'N/A'],
    ['Nombre de places', String(ticket.quantity)],
    ['Montant', `${total} F`],
  ]
  let y = 678
  for (const [label, value] of details) {
    page.drawText(`${label} :`, { x: 52, y, size: 11, font: boldFont, color: rgb(0.18, 0.07, 0.04) })
    page.drawText(value, { x: 190, y, size: 11, font, color: rgb(0.18, 0.07, 0.04), maxWidth: 350 })
    y -= 34
  }

  page.drawImage(qrImage, { x: 197, y: 260, width: 200, height: 200 })
  page.drawText('Présentez ce QR code à l’entrée', { x: 165, y: 238, size: 11, font: boldFont, color: rgb(0.18, 0.07, 0.04) })
  page.drawText(`Code billet : ${ticket.qr_token}`, { x: 52, y: 190, size: 9, font, color: rgb(0.35, 0.35, 0.35), maxWidth: 490 })
  page.drawText('Billet nominatif, valable pour une seule entrée.', { x: 52, y: 82, size: 10, font, color: rgb(0.35, 0.35, 0.35) })

  return document.save()
}
