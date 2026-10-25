import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import QRCode from 'npm:qrcode@1.5.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, character => entities[character] || character)
}

function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

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
  const page = document.addPage([595, 842])
  const font = await document.embedFont(StandardFonts.Helvetica)
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold)
  const qrPng = await QRCode.toBuffer(ticket.qr_token, { type: 'png', width: 360, margin: 1 })
  const qrImage = await document.embedPng(qrPng)
  const date = event.event_date ? new Date(event.event_date).toLocaleDateString('fr-FR') : 'À préciser'
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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/+$/, '')

  if (!authorization || !supabaseUrl || !supabaseAnonKey || !resendApiKey || !fromEmail || !siteUrl) {
    return jsonResponse({ error: 'Resend email notification service is not configured' }, 500)
  }

  let requestId: string
  try {
    const body = await request.json()
    requestId = body.request_id
    if (typeof requestId !== 'string' || !requestId) return jsonResponse({ error: 'request_id is required' }, 400)
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return jsonResponse({ error: 'A valid authenticated session is required' }, 401)

  const { data: notification, error: claimError } = await supabase.rpc(
    'claim_ticket_decision_email',
    { p_request_id: requestId },
  )
  if (claimError) return jsonResponse({ error: claimError.message }, 403)
  if (!notification || typeof notification.status !== 'string') {
    return jsonResponse({ error: 'Resend email notification could not be loaded' }, 500)
  }
  if (notification.status === 'sent' || notification.status === 'sending' && !notification.email) {
    return jsonResponse({ status: notification.status })
  }

  const approved = notification.decision === 'approved'
  const subject = approved
    ? `Votre demande pour ${notification.event_name} a été validée`
    : `Votre demande pour ${notification.event_name} a été refusée`
  const ticketLink = notification.ticket_token
    ? `${siteUrl}/ticket/${encodeURIComponent(notification.ticket_token)}`
    : null
  const downloadLink = notification.ticket_token
    ? `${supabaseUrl}/functions/v1/download-ticket-pdf?token=${encodeURIComponent(notification.ticket_token)}`
    : null
  const reason = notification.admin_notes
    ? `<p><strong>Motif :</strong> ${escapeHtml(notification.admin_notes)}</p>`
    : ''
  const ticketDetails = ticketLink && downloadLink
    ? `<p>Consulter votre billet : <a href="${ticketLink}">ouvrir la page du billet</a>.</p><p><a href="${downloadLink}">Télécharger votre billet en PDF</a>.</p>`
    : ''

  const attachments: Array<{ filename: string; content: string }> = []
  if (approved && notification.ticket_token) {
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('full_name, phone, quantity, qr_token, table:tables(name, price)')
      .eq('qr_token', notification.ticket_token)
      .maybeSingle()
    const { data: settings, error: settingsError } = await supabase
      .from('event_settings')
      .select('event_name, event_date, event_location')
      .limit(1)
      .maybeSingle()

    if (ticketError || !ticket || settingsError) {
      const message = ticketError?.message || settingsError?.message || 'Approved ticket details could not be loaded'
      const { error: completionError } = await supabase.rpc('complete_ticket_decision_email', {
        p_request_id: requestId,
        p_sent: false,
        p_error: message,
      })
      if (completionError) return jsonResponse({ error: `${message}; failed to record delivery failure: ${completionError.message}` }, 500)
      return jsonResponse({ status: 'failed', error: message }, 500)
    }

    try {
      const pdf = await createTicketPdf({
        full_name: ticket.full_name,
        phone: ticket.phone,
        quantity: ticket.quantity,
        qr_token: ticket.qr_token,
        table_name: ticket.table?.name || 'N/A',
        table_price: Number(ticket.table?.price || 0),
      }, {
        event_name: settings?.event_name || notification.event_name,
        event_date: settings?.event_date || null,
        event_location: settings?.event_location || 'À préciser',
      })
      attachments.push({
        filename: `billet-${ticket.qr_token}.pdf`,
        content: encodeBase64(pdf),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ticket PDF generation failed'
      const { error: completionError } = await supabase.rpc('complete_ticket_decision_email', {
        p_request_id: requestId,
        p_sent: false,
        p_error: message,
      })
      if (completionError) return jsonResponse({ error: `${message}; failed to record delivery failure: ${completionError.message}` }, 500)
      return jsonResponse({ status: 'failed', error: message }, 500)
    }
  }

  const emailHtml = [
    `<p>Bonjour ${escapeHtml(notification.full_name)},</p>`,
    `<p>Votre demande pour <strong>${escapeHtml(notification.event_name)}</strong> a été ${approved ? 'validée' : 'refusée'} par l’administration.</p>`,
    ticketDetails,
    reason,
    '<p>Merci.</p>',
  ].join('')

  try {
    const providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [notification.email],
        subject,
        html: emailHtml,
        ...(attachments.length ? { attachments } : {}),
      }),
    })
    const responseText = await providerResponse.text()
    let providerBody: { id?: string; message?: string; name?: string } | null = null
    try {
      providerBody = responseText ? JSON.parse(responseText) : null
    } catch {
      if (providerResponse.ok) throw new Error('Resend returned an invalid response')
    }

    if (!providerResponse.ok || !providerBody?.id) {
      throw new Error(providerBody?.message || providerBody?.name || responseText || `Resend request failed (${providerResponse.status})`)
    }

    const { error: completionError } = await supabase.rpc('complete_ticket_decision_email', {
      p_request_id: requestId,
      p_sent: true,
    })
    if (completionError) {
      return jsonResponse({ error: `Email sent but delivery status could not be saved: ${completionError.message}` }, 500)
    }

    return jsonResponse({ status: 'sent', message_id: providerBody.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend email delivery failed'
    const { error: completionError } = await supabase.rpc('complete_ticket_decision_email', {
      p_request_id: requestId,
      p_sent: false,
      p_error: message,
    })
    if (completionError) {
      return jsonResponse({ error: `${message}; failed to record delivery failure: ${completionError.message}` }, 500)
    }
    return jsonResponse({ status: 'failed', error: message }, 502)
  }
})
