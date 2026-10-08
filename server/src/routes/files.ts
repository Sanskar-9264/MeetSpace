import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { isValidObjectId } from 'mongoose';
import type { Server } from 'socket.io';
import { config } from '../config';
import { FileRecord, IFileRecord } from '../models/FileRecord';
import { Room } from '../models/Room';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { decryptBuffer, encryptBuffer } from '../utils/crypto';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 1 },
});

const isMember = (roomId: string, userId: string) => Room.exists({ roomId, members: userId });

const toDto = (f: IFileRecord & { id: string }) => ({
  id: f.id,
  name: f.originalName,
  size: f.size,
  mimeType: f.mimeType,
  uploader: f.uploaderName,
  createdAt: f.createdAt,
});

router.get(
  '/download/:id',
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: 'File not found' });
    const record = await FileRecord.findById(req.params.id);
    if (!record || !(await isMember(record.roomId, req.user!.id))) {
      return res.status(404).json({ error: 'File not found' });
    }
    const encrypted = await fs.readFile(path.join(config.uploadDir, record.storedName));
    const plain = decryptBuffer(encrypted, record.iv, record.tag);

    res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
    );
    res.send(plain);
  }),
);

router.get(
  '/:roomId',
  asyncHandler(async (req, res) => {
    if (!(await isMember(req.params.roomId, req.user!.id))) {
      return res.status(403).json({ error: 'Join the room to see its files' });
    }
    const files = await FileRecord.find({ roomId: req.params.roomId }).sort({ createdAt: -1 }).limit(100);
    res.json(files.map(toDto));
  }),
);

router.post(
  '/:roomId',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    if (!(await isMember(roomId, req.user!.id))) {
      return res.status(403).json({ error: 'Join the room before sharing files' });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a file to share' });

    // multer decodes names as latin1; restore UTF-8 so non-English names survive.
    const originalName = path
      .basename(Buffer.from(req.file.originalname, 'latin1').toString('utf8'))
      .slice(0, 200);

    const { data, iv, tag } = encryptBuffer(req.file.buffer);
    const storedName = randomBytes(16).toString('hex');
    await fs.writeFile(path.join(config.uploadDir, storedName), data);

    const record = await FileRecord.create({
      roomId,
      originalName,
      mimeType: req.file.mimetype,
      size: req.file.size,
      storedName,
      iv,
      tag,
      uploaderId: req.user!.id,
      uploaderName: req.user!.name,
    });

    const dto = toDto(record);
    (req.app.get('io') as Server).to(roomId).emit('file:added', dto);
    res.status(201).json(dto);
  }),
);

export default router;
