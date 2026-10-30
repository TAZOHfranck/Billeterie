import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const adminEmail = 'tazohdunil@gmail.com'

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
  let trancheId: string | null = null
  try {
    const body = await request.json()
    requestId = body.request_id
    trancheId = typeof body.tranche_id === 'string' && body.tranche_id ? body.tranche_id : null
    if (typeof requestId !== 'string' || !requestId) return jsonResponse({ error: 'request_id is required' }, 400)
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return jsonResponse({ error: 'A valid authenticated session is required' }, 401)

  const { data: notification, error: claimError } = trancheId
    ? await supabase.rpc('claim_ticket_payment_tranche_admin_email', { p_tranche_id: trancheId })
    : await supabase.rpc('claim_ticket_request_admin_email', { p_request_id: requestId })
  if (claimError) return jsonResponse({ error: claimError.message }, 403)
  if (!notification || typeof notification.status !== 'string') {
    return jsonResponse({ error: 'Ticket request notification could not be loaded' }, 500)
  }
  if (notification.status === 'sent' || notification.status === 'sending' && !notification.email) {
    return jsonResponse({ status: notification.status })
  }
  if (notification.status !== 'sending') {
    return jsonResponse({ error: 'Ticket request email could not be claimed' }, 500)
  }

  const isTranche = typeof notification.tranche_id === 'string'
  const emailHtml = [
    `<p>${isTranche ? 'Un nouveau versement a été enregistré' : 'Une nouvelle demande de billet a été déposée'} pour <strong>${escapeHtml(notification.event_name)}</strong>.</p>`,
    `<p><strong>Nom :</strong> ${escapeHtml(notification.full_name)}<br>`,
    `<strong>Email :</strong> ${escapeHtml(notification.email)}<br>`,
    `<strong>Téléphone :</strong> ${escapeHtml(notification.phone)}<br>`,
    `<strong>Table :</strong> ${escapeHtml(notification.table_name)}<br>`,
    `<strong>Places :</strong> ${notification.quantity}<br>`,
    isTranche
      ? `<strong>Montant du versement :</strong> ${Number(notification.tranche_amount).toLocaleString('fr-FR')} F<br>`
      : `<strong>Montant :</strong> ${Number(notification.table_price * notification.quantity).toLocaleString('fr-FR')} F<br>`,
    isTranche
      ? `<strong>Montant approuvé :</strong> ${Number(notification.approved_amount).toLocaleString('fr-FR')} F<br><strong>Solde restant :</strong> ${Number(notification.remaining_amount).toLocaleString('fr-FR')} F<br>`
      : '',
    `<strong>Paiement :</strong> ${escapeHtml(notification.payment_method_name)}</p>`,
    `<p><a href="${siteUrl}/admin">Ouvrir l’administration pour examiner la demande</a></p>`,
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
        to: [adminEmail],
        subject: isTranche
          ? `Nouveau versement à vérifier - ${notification.full_name}`
          : `Nouvelle demande de billet - ${notification.full_name}`,
        html: emailHtml,
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

    const { error: completionError } = trancheId
      ? await supabase.rpc('complete_ticket_payment_tranche_admin_email', {
          p_tranche_id: trancheId,
          p_sent: true,
        })
      : await supabase.rpc('complete_ticket_request_admin_email', {
          p_request_id: requestId,
          p_sent: true,
        })
    if (completionError) {
      return jsonResponse({ error: `Email sent but delivery status could not be saved: ${completionError.message}` }, 500)
    }

    return jsonResponse({ status: 'sent', message_id: providerBody.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend email delivery failed'
    const { error: completionError } = trancheId
      ? await supabase.rpc('complete_ticket_payment_tranche_admin_email', {
          p_tranche_id: trancheId,
          p_sent: false,
          p_error: message,
        })
      : await supabase.rpc('complete_ticket_request_admin_email', {
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
