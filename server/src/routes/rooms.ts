import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Room, IRoom } from '../models/Room';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(requireAuth);

const makeRoomId = () => `${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`;

const toDto = (room: IRoom, userId: string) => ({
  roomId: room.roomId,
  name: room.name,
  createdAt: room.createdAt,
  isOwner: room.owner.toString() === userId,
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = z
      .string({ required_error: 'Give the room a name' })
      .trim()
      .min(1, 'Give the room a name')
      .max(80)
      .safeParse(req.body?.name);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const room = await Room.create({
      roomId: makeRoomId(),
      name: parsed.data,
      owner: req.user!.id,
      members: [req.user!.id],
    });
    res.status(201).json(toDto(room, req.user!.id));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rooms = await Room.find({ members: req.user!.id }).sort({ createdAt: -1 }).limit(20);
    res.json(rooms.map((r) => toDto(r, req.user!.id)));
  }),
);

// Anyone signed in who has the room code can join. Joining adds them to the member list,
// which is what gates chat, the whiteboard, and file access.
router.post(
  '/:roomId/join',
  asyncHandler(async (req, res) => {
    const room = await Room.findOneAndUpdate(
      { roomId: req.params.roomId },
      { $addToSet: { members: req.user!.id } },
      { new: true },
    );
    if (!room) return res.status(404).json({ error: 'No room found with that code' });
    res.json(toDto(room, req.user!.id));
  }),
);

export default router;
