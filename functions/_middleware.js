export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // 静态资源和 API 登录接口不需要认证
  const publicPaths = ['/api/login', '/api/logout'];
  if (publicPaths.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  // 保护数据文件
  if (url.pathname === '/bond_data.json' || url.pathname === '/quant_data.json') {
    const cookie = parseCookie(request.headers.get('Cookie') || '');
    const token = cookie['auth'];

    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证 token
    const AUTH_SECRET = env.AUTH_SECRET || 'default-secret-change-me';
    const valid = await verifyToken(token, AUTH_SECRET);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
}

function parseCookie(str) {
  const obj = {};
  for (const pair of str.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) obj[k] = v.join('=');
  }
  return obj;
}

async function verifyToken(token, secret) {
  try {
    const decoded = atob(token);
    const parts = decoded.split(':');
    if (parts.length < 3) return false;

    const username = parts[0];
    const ts = parts[1];
    const sigHex = parts.slice(2).join(':');

    // 检查 token 是否过期（7天）
    const age = Date.now() - parseInt(ts);
    if (age > 7 * 24 * 60 * 60 * 1000) return false;

    // 验证 HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(username + ':' + ts));
    const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');

    return sigHex === expectedHex;
  } catch {
    return false;
  }
}
