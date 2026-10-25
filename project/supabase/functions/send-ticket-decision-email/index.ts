import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const appId = 'e5380209-ad0e-4b92-a669-7333c176154e'

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
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/+$/, '')

  if (!authorization || !supabaseUrl || !supabaseAnonKey || !oneSignalApiKey || !siteUrl) {
    return jsonResponse({ error: 'Email notification service is not configured' }, 500)
  }

  let requestId: string
  try {
    const body = await request.json()
    requestId = body.request_id
    if (typeof requestId !== 'string' || !requestId) {
      return jsonResponse({ error: 'request_id is required' }, 400)
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return jsonResponse({ error: 'A valid authenticated session is required' }, 401)
  }

  const { data: notification, error: claimError } = await supabase.rpc(
    'claim_ticket_decision_email',
    { p_request_id: requestId },
  )
  if (claimError) {
    return jsonResponse({ error: claimError.message }, 403)
  }
  if (!notification || typeof notification.status !== 'string') {
    return jsonResponse({ error: 'OneSignal email notification could not be loaded' }, 500)
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
  const reason = notification.admin_notes
    ? `<p><strong>Motif :</strong> ${escapeHtml(notification.admin_notes)}</p>`
    : ''
  const ticketDetails = ticketLink
    ? `<p>Votre billet est disponible ici : <a href="${ticketLink}">Afficher mon billet</a>.</p>`
    : ''
  const emailBody = [
    `<p>Bonjour ${escapeHtml(notification.full_name)},</p>`,
    `<p>Votre demande pour <strong>${escapeHtml(notification.event_name)}</strong> a été ${approved ? 'validée' : 'refusée'} par l’administration.</p>`,
    ticketDetails,
    reason,
    '<p>Merci.</p>',
  ].join('')

  let providerResponseText = ''
  try {
    const providerResponse = await fetch('https://api.onesignal.com/notifications?c=email', {
      method: 'POST',
      headers: {
        Authorization: `Key ${oneSignalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        email_to: [notification.email],
        email_subject: subject,
        email_body: emailBody,
      }),
    })

    providerResponseText = await providerResponse.text()
    let providerResponseBody: { id?: string; errors?: unknown } | null = null
    try {
      providerResponseBody = providerResponseText ? JSON.parse(providerResponseText) : null
    } catch {
      if (providerResponse.ok) throw new Error('OneSignal returned an invalid response')
    }

    if (!providerResponse.ok || providerResponseBody?.errors) {
      throw new Error(providerResponseText || `OneSignal request failed (${providerResponse.status})`)
    }

    const { error: completionError } = await supabase.rpc('complete_ticket_decision_email', {
      p_request_id: requestId,
      p_sent: true,
    })
    if (completionError) {
      return jsonResponse({ error: `Email sent but delivery status could not be saved: ${completionError.message}` }, 500)
    }

    return jsonResponse({ status: 'sent', message_id: providerResponseBody?.id ?? null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OneSignal email delivery failed'
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
