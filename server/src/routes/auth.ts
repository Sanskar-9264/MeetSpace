import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User';
import { signToken } from '../utils/jwt';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const publicUser = (u: { id: string; name: string; email: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { name, email, password } = parsed.data;

    if (await User.exists({ email })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { email, password } = parsed.data;

    const user = await User.findOne({ email });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) return res.status(401).json({ error: 'Email or password is incorrect' });

    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    res.json({ user: publicUser(user) });
  }),
);

export default router;
