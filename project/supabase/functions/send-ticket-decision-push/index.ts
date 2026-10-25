import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const appId = 'e5380209-ad0e-4b92-a669-7333c176154e'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/+$/, '')

  if (!authorization || !supabaseUrl || !supabaseAnonKey || !oneSignalApiKey || !siteUrl) {
    return jsonResponse({ error: 'OneSignal push notification service is not configured' }, 500)
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
    'claim_ticket_decision_push',
    { p_request_id: requestId },
  )
  if (claimError) return jsonResponse({ error: claimError.message }, 403)
  if (!notification || typeof notification.status !== 'string') {
    return jsonResponse({ error: 'OneSignal push notification could not be loaded' }, 500)
  }
  if (notification.status === 'sent' || notification.status === 'sending' && !notification.user_id) {
    return jsonResponse({ status: notification.status })
  }
  if (notification.status !== 'sending' || typeof notification.user_id !== 'string') {
    return jsonResponse({ error: 'Ticket decision push could not be claimed' }, 500)
  }

  const approved = notification.decision === 'approved'
  const ticketUrl = notification.ticket_token
    ? `${siteUrl}/ticket/${encodeURIComponent(notification.ticket_token)}`
    : `${siteUrl}/my-tickets`
  const reason = notification.admin_notes ? ` Motif : ${notification.admin_notes}` : ''

  try {
    const providerResponse = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${oneSignalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        include_aliases: { external_id: [notification.user_id] },
        target_channel: 'push',
        headings: { fr: approved ? 'Demande validée' : 'Demande refusée' },
        contents: {
          fr: approved
            ? `Votre demande pour ${notification.event_name} a été validée. Consultez votre billet.${reason}`
            : `Votre demande pour ${notification.event_name} a été refusée.${reason}`,
        },
        url: ticketUrl,
        data: {
          request_id: requestId,
          decision: notification.decision,
          ticket_url: notification.ticket_token ? ticketUrl : null,
        },
      }),
    })

    const responseText = await providerResponse.text()
    let providerBody: { id?: string; recipients?: number; errors?: unknown; message?: string } | null = null
    try {
      providerBody = responseText ? JSON.parse(responseText) : null
    } catch {
      if (providerResponse.ok) throw new Error('OneSignal returned an invalid response')
    }

    if (!providerResponse.ok || providerBody?.errors || !providerBody?.id) {
      throw new Error(
        providerBody?.message ||
        (typeof providerBody?.errors === 'string' ? providerBody.errors : JSON.stringify(providerBody?.errors)) ||
        responseText ||
        `OneSignal request failed (${providerResponse.status})`,
      )
    }

    if (providerBody.recipients === 0) {
      throw new Error('Aucun appareil ne reçoit les notifications. L’utilisateur doit activer les notifications push et se connecter de nouveau.')
    }

    const { error: completionError } = await supabase.rpc('complete_ticket_decision_push', {
      p_request_id: requestId,
      p_sent: true,
    })
    if (completionError) {
      return jsonResponse({ error: `Push sent but delivery status could not be saved: ${completionError.message}` }, 500)
    }

    return jsonResponse({ status: 'sent', message_id: providerBody.id, recipients: providerBody.recipients ?? null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OneSignal push delivery failed'
    const { error: completionError } = await supabase.rpc('complete_ticket_decision_push', {
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
