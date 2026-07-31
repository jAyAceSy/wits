// Supabase Edge Function: invite-user
//
// Lets an authenticated ADMIN create a new WITS user (Warehouse Staff or
// Administrator) without ever exposing the service_role key to the
// browser. The function itself runs with the service_role key as a
// Supabase secret, server-side only.
//
// Deploy with:
//   supabase functions deploy invite-user
//
// Called from the app via:
//   supabase.functions.invoke('invite-user', { body: { email, full_name, role } })

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''

    // Client scoped to the calling user, to verify who they are.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
    } = await callerClient.auth.getUser()

    if (!user) {
      return json({ error: 'Not authenticated.' }, 401)
    }

    const { data: callerProfile } = await callerClient
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return json({ error: 'Only administrators can create users.' }, 403)
    }

    const { email, full_name, role } = await req.json()

    if (!email || !full_name || !['admin', 'warehouse_staff'].includes(role)) {
      return json({ error: 'email, full_name, and a valid role are required.' }, 400)
    }

    // Admin client with the service role key — server-side only.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role },
    })

    if (error) {
      return json({ error: error.message }, 400)
    }

    return json({ user: data.user }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
