import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  sub: string;
  name: string;
  email: string;
}

export function signToken(user: { id: string; name: string; email: string }): string {
  const payload: TokenPayload = { sub: user.id, name: user.name, email: user.email };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
}
