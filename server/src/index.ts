import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { attachSocket } from './socket';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import fileRoutes from './routes/files';

async function main() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'blob:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/files', fileRoutes);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // In production the built React app is served by this same server.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? `Files can be up to ${config.maxFileMb} MB` : 'Upload failed';
      return res.status(413).json({ error: message });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });

  const server = http.createServer(app);
  app.set('io', attachSocket(server));

  server.listen(config.port, () => console.log(`Server running on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
