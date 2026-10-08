import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in to continue' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
}
