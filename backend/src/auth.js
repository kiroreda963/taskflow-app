import jwt from 'jsonwebtoken';

const TOKEN_TTL = '24h';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    return 'dev-only-change-me';
  }
  return s;
}

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, secret(), { expiresIn: TOKEN_TTL });
}

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, secret());
    req.userId = Number(payload.sub);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
