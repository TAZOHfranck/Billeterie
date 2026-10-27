import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import QRCode from 'npm:qrcode@1.5.4'

async function createTrancheReceiptPdf(tranche: {
  receipt_token: string
  amount: number
  approved_amount: number
  target_amount: number
  decided_at: string
  full_name: string
  phone: string
  quantity: number
  table_name: string
  payment_method_name: string
}, event: {
  event_name: string
  event_location: string
}) {
  const document = await PDFDocument.create()
  const page = document.addPage([419.53, 595.28])
  const font = await document.embedFont(StandardFonts.Helvetica)
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold)
  const qrPng = await QRCode.toBuffer(tranche.receipt_token, { type: 'png', width: 280, margin: 1 })
  const qrImage = await document.embedPng(qrPng)
  const ink = rgb(0.09, 0.03, 0.02)
  const gold = rgb(0.72, 0.47, 0.12)
  const muted = rgb(0.35, 0.35, 0.35)
  const cream = rgb(1, 0.992, 0.969)
  const remaining = Math.max(0, tranche.target_amount - tranche.approved_amount)
  const date = new Date(tranche.decided_at).toLocaleString('fr-FR')

  page.drawRectangle({ x: 18, y: 18, width: 383.53, height: 559.28, color: cream, borderColor: gold, borderWidth: 2 })
  page.drawRectangle({ x: 18, y: 480, width: 383.53, height: 97.28, color: ink })
  page.drawRectangle({ x: 18, y: 573, width: 383.53, height: 4.28, color: gold })
  page.drawText('IPD-YAOUNDÉ PRÉSENTE', { x: 38, y: 552, size: 8, font: boldFont, color: rgb(1, 0.82, 0.45) })
  page.drawText(event.event_name, { x: 38, y: 521, size: 18, font: boldFont, color: rgb(1, 1, 1), maxWidth: 343 })
  page.drawText('REÇU DE VERSEMENT', { x: 38, y: 495, size: 10, font: boldFont, color: rgb(1, 0.82, 0.45) })

  page.drawRectangle({ x: 38, y: 441, width: 343, height: 23, color: rgb(0.91, 0.97, 0.92) })
  page.drawText('VERSEMENT VALIDÉ', { x: 144, y: 449, size: 10, font: boldFont, color: rgb(0.12, 0.42, 0.24) })

  page.drawText('PARTICIPANT', { x: 38, y: 418, size: 7, font: boldFont, color: gold })
  page.drawText(tranche.full_name, { x: 38, y: 395, size: 15, font: boldFont, color: ink, maxWidth: 343 })
  page.drawText(`Téléphone : ${tranche.phone}`, { x: 38, y: 376, size: 9, font, color: muted })

  page.drawRectangle({ x: 38, y: 337, width: 343, height: 26, color: rgb(0.97, 0.93, 0.88) })
  page.drawText('MONTANT DU VERSEMENT', { x: 53, y: 347, size: 8, font: boldFont, color: muted })
  page.drawText(`${tranche.amount.toLocaleString('fr-FR')} F`, { x: 246, y: 345, size: 13, font: boldFont, color: ink })

  const details = [
    ['TABLE', tranche.table_name],
    ['PLACES', String(tranche.quantity)],
    ['MODE DE PAIEMENT', tranche.payment_method_name],
    ['LIEU', event.event_location || 'À préciser'],
  ]
  let y = 310
  for (const [label, value] of details) {
    page.drawText(label, { x: 38, y, size: 7, font: boldFont, color: muted })
    page.drawText(value, { x: 38, y: y - 16, size: 9, font: boldFont, color: ink, maxWidth: 343 })
    y -= 45
  }

  page.drawRectangle({ x: 38, y: 130, width: 343, height: 2, color: rgb(0.88, 0.84, 0.78) })
  page.drawText('TOTAL ACHAT', { x: 38, y: 112, size: 8, font: boldFont, color: muted })
  page.drawText(`${tranche.target_amount.toLocaleString('fr-FR')} F`, { x: 38, y: 94, size: 11, font: boldFont, color: ink })
  page.drawText('CUMUL VALIDÉ', { x: 157, y: 112, size: 8, font: boldFont, color: muted })
  page.drawText(`${tranche.approved_amount.toLocaleString('fr-FR')} F`, { x: 157, y: 94, size: 11, font: boldFont, color: rgb(0.12, 0.42, 0.24) })
  page.drawText('SOLDE RESTANT', { x: 281, y: 112, size: 8, font: boldFont, color: muted })
  page.drawText(`${remaining.toLocaleString('fr-FR')} F`, { x: 281, y: 94, size: 11, font: boldFont, color: remaining > 0 ? rgb(0.65, 0.25, 0.12) : rgb(0.12, 0.42, 0.24) })

  page.drawImage(qrImage, { x: 170, y: 28, width: 80, height: 80 })
  page.drawText(`Validé le ${date}`, { x: 38, y: 68, size: 7, font, color: muted })
  page.drawText(`Référence : ${tranche.receipt_token}`, { x: 38, y: 55, size: 6, font, color: muted, maxWidth: 343 })
  page.drawText('Ce reçu atteste la validation d’un versement.', { x: 38, y: 38, size: 7, font: boldFont, color: ink })

  return document.save()
}

Deno.serve(async request => {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (request.method !== 'GET' || !token) {
    return new Response('A tranche receipt token is required', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Tranche receipt service is not configured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: tranche, error: trancheError } = await supabase
    .from('ticket_payment_tranches')
    .select(`
      receipt_token,
      amount,
      status,
      decided_at,
      request:ticket_requests(
        full_name,
        phone,
        quantity,
        target_amount,
        approved_amount,
        table:tables(name),
        payment_method:payment_methods(name)
      )
    `)
    .eq('receipt_token', token)
    .eq('status', 'approved')
    .maybeSingle()

  if (trancheError) return new Response('Unable to load tranche receipt', { status: 500 })
  if (!tranche || !tranche.request) return new Response('Approved tranche receipt not found', { status: 404 })

  const { data: settings, error: settingsError } = await supabase
    .from('event_settings')
    .select('event_name, event_location')
    .limit(1)
    .maybeSingle()
  if (settingsError) return new Response('Unable to load event details', { status: 500 })

  try {
    const pdf = await createTrancheReceiptPdf({
      receipt_token: tranche.receipt_token,
      amount: Number(tranche.amount),
      approved_amount: Number(tranche.request.approved_amount),
      target_amount: Number(tranche.request.target_amount),
      decided_at: tranche.decided_at,
      full_name: tranche.request.full_name,
      phone: tranche.request.phone,
      quantity: tranche.request.quantity,
      table_name: tranche.request.table?.name || 'N/A',
      payment_method_name: tranche.request.payment_method?.name || 'N/A',
    }, {
      event_name: settings?.event_name || 'Événement',
      event_location: settings?.event_location || 'À préciser',
    })
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="recu-versement-${tranche.receipt_token}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Tranche receipt PDF generation failed', error)
    return new Response('Unable to generate tranche receipt PDF', { status: 500 })
  }
})
