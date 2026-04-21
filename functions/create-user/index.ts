import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  email: string
  password: string
  role: string
}

serve(async (req) => {
  // Chỉ cho phép method POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { email, password, role } = await req.json() as RequestBody

    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email và mật khẩu là bắt buộc' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Tạo admin client với service_role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Tạo user mới
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      console.error('Lỗi tạo user:', createError)
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không thể tạo user' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Thêm role vào bảng user_roles
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userData.user.id,
        role: role || 'viewer',
        created_at: new Date().toISOString()
      })

    if (roleError) {
      console.error('Lỗi thêm role:', roleError)
      // Vẫn trả về thành công nhưng báo warning
      return new Response(
        JSON.stringify({
          success: true,
          user: { id: userData.user.id, email: userData.user.email },
          warning: 'Tạo user thành công nhưng thêm role bị lỗi: ' + roleError.message
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Thành công
    return new Response(
      JSON.stringify({
        success: true,
        user: { id: userData.user.id, email: userData.user.email },
        role: role || 'viewer'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Lỗi không xác định:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Lỗi server: ' + error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})