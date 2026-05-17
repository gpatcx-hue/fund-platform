export async function onRequestPost(context) {
  const { request, env } = context;

  const AUTH_USER = env.AUTH_USERNAME || 'admin';
  const AUTH_PASS = env.AUTH_PASSWORD || 'changeme';
  const AUTH_SECRET = env.AUTH_SECRET || 'default-secret-change-me';

  try {
    const body = await request.json();
    const { username, password } = body;

    if (username === AUTH_USER && password === AUTH_PASS) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(AUTH_SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const ts = Date.now().toString();
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(username + ':' + ts));
      const token = btoa(username + ':' + ts + ':' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join(''));

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      });
    }

    return new Response(JSON.stringify({ ok: false, msg: '用户名或密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, msg: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
