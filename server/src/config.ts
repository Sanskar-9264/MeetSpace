import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}. See server/.env.example`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/meetspace'),
  jwtSecret: required('JWT_SECRET'),
  fileKey: Buffer.from(required('FILE_ENCRYPTION_KEY'), 'hex'),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  maxFileMb: Number(process.env.MAX_FILE_MB ?? 25),
  isProd: process.env.NODE_ENV === 'production',
};

if (config.fileKey.length !== 32) {
  throw new Error('FILE_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
}
