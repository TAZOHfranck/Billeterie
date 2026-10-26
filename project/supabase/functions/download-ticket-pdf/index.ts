import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import QRCode from 'npm:qrcode@1.5.4'

async function createTicketPdf(ticket: {
  full_name: string
  phone: string
  quantity: number
  qr_token: string
  table_name: string
  table_price: number
}, event: {
  event_name: string
  event_date: string | null
  event_location: string
}) {
  const document = await PDFDocument.create()
  const page = document.addPage([419.53, 595.28])
  const font = await document.embedFont(StandardFonts.Helvetica)
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold)
  const qrPng = await QRCode.toBuffer(ticket.qr_token, { type: 'png', width: 360, margin: 1 })
  const qrImage = await document.embedPng(qrPng)
  const date = event.event_date ? new Date(event.event_date).toLocaleDateString('fr-FR') : 'À préciser'
  const total = (ticket.table_price * ticket.quantity).toLocaleString('fr-FR')
  const ink = rgb(0.09, 0.03, 0.02)
  const gold = rgb(0.72, 0.47, 0.12)
  const muted = rgb(0.35, 0.35, 0.35)
  const cream = rgb(1, 0.992, 0.969)
  const fitTextSize = (text: string, textFont: typeof font, maxWidth: number, maxSize: number, minSize: number) => {
    const textWidth = textFont.widthOfTextAtSize(text, maxSize)
    if (textWidth <= maxWidth || textWidth === 0) return maxSize
    return Math.max(minSize, maxSize * maxWidth / textWidth)
  }

  page.drawRectangle({ x: 18, y: 18, width: 383.53, height: 559.28, color: cream, borderColor: gold, borderWidth: 2 })
  page.drawRectangle({ x: 18, y: 480, width: 383.53, height: 97.28, color: ink })
  page.drawRectangle({ x: 18, y: 573, width: 383.53, height: 4.28, color: gold })
  page.drawText('IPD-YAOUNDÉ PRÉSENTE', { x: 38, y: 552, size: 8, font: boldFont, color: rgb(1, 0.82, 0.45) })
  page.drawText(event.event_name, { x: 38, y: 521, size: fitTextSize(event.event_name, boldFont, 343, 20, 11), font: boldFont, color: rgb(1, 1, 1) })
  page.drawText('BILLET OFFICIEL', { x: 38, y: 495, size: 10, font: boldFont, color: rgb(1, 0.82, 0.45) })
  page.drawRectangle({ x: 38, y: 447, width: 343, height: 23, color: rgb(0.91, 0.97, 0.92) })
  page.drawText('BILLET VALIDÉ', { x: 155, y: 454, size: 10, font: boldFont, color: rgb(0.12, 0.42, 0.24) })

  page.drawText('NOM DU PARTICIPANT', { x: 38, y: 425, size: 7, font: boldFont, color: gold })
  page.drawText(ticket.full_name, { x: 38, y: 402, size: fitTextSize(ticket.full_name, boldFont, 343, 16, 8), font: boldFont, color: ink })
  page.drawText(`Téléphone : ${ticket.phone}`, { x: 38, y: 383, size: 9, font, color: muted, maxWidth: 343 })

  page.drawRectangle({ x: 38, y: 367, width: 164, height: 1, color: rgb(0.88, 0.84, 0.78) })
  page.drawRectangle({ x: 217, y: 367, width: 164, height: 1, color: rgb(0.88, 0.84, 0.78) })
  page.drawText('DATE', { x: 38, y: 351, size: 7, font: boldFont, color: muted })
  page.drawText(date, { x: 38, y: 335, size: 10, font: boldFont, color: ink })
  page.drawText('LIEU', { x: 217, y: 351, size: 7, font: boldFont, color: muted })
  const location = event.event_location || 'À préciser'
  page.drawText(location, { x: 217, y: 335, size: fitTextSize(location, boldFont, 164, 9, 6), font: boldFont, color: ink })
  page.drawText('TABLE', { x: 38, y: 308, size: 7, font: boldFont, color: muted })
  const tableName = ticket.table_name || 'N/A'
  page.drawText(tableName, { x: 38, y: 292, size: fitTextSize(tableName, boldFont, 164, 10, 6), font: boldFont, color: ink })
  page.drawText('NOMBRE DE PLACES', { x: 217, y: 308, size: 7, font: boldFont, color: muted })
  page.drawText(String(ticket.quantity), { x: 217, y: 292, size: 10, font: boldFont, color: ink })

  page.drawRectangle({ x: 145, y: 251, width: 130, height: 30, color: rgb(0.97, 0.93, 0.88) })
  page.drawText('MONTANT', { x: 180, y: 269, size: 7, font: boldFont, color: muted })
  page.drawText(`${total} F`, { x: 178, y: 255, size: 12, font: boldFont, color: ink })

  page.drawImage(qrImage, { x: 153, y: 113, width: 114, height: 114 })
  page.drawText('Présentez ce QR code à l’entrée', { x: 133, y: 99, size: 9, font: boldFont, color: ink })
  page.drawText(`Code billet : ${ticket.qr_token}`, { x: 38, y: 82, size: 7, font, color: muted, maxWidth: 343 })
  page.drawRectangle({ x: 18, y: 18, width: 383.53, height: 43, color: rgb(0.97, 0.93, 0.88) })
  page.drawText('TENUE ÉLÉGANTE EXIGÉE', { x: 38, y: 43, size: 9, font: boldFont, color: gold })
  page.drawText('Billet nominatif, valable pour une seule entrée.', { x: 38, y: 28, size: 8, font, color: muted })

  return document.save()
}

Deno.serve(async request => {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (request.method !== 'GET' || !token) {
    return new Response('A ticket token is required', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Ticket download service is not configured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('full_name, phone, quantity, qr_token, status, table:tables(name, price)')
    .eq('qr_token', token)
    .maybeSingle()

  if (ticketError) return new Response('Unable to load ticket', { status: 500 })
  if (!ticket || !['approved', 'used'].includes(ticket.status)) {
    return new Response('Approved ticket not found', { status: 404 })
  }

  const { data: settings, error: settingsError } = await supabase
    .from('event_settings')
    .select('event_name, event_date, event_location')
    .limit(1)
    .maybeSingle()
  if (settingsError) return new Response('Unable to load event details', { status: 500 })

  try {
    const pdf = await createTicketPdf({
      full_name: ticket.full_name,
      phone: ticket.phone,
      quantity: ticket.quantity,
      qr_token: ticket.qr_token,
      table_name: ticket.table?.name || 'N/A',
      table_price: Number(ticket.table?.price || 0),
    }, {
      event_name: settings?.event_name || 'Billet événement',
      event_date: settings?.event_date || null,
      event_location: settings?.event_location || 'À préciser',
    })
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="billet-${ticket.qr_token}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Ticket PDF generation failed', error)
    return new Response('Unable to generate ticket PDF', { status: 500 })
  }
})
