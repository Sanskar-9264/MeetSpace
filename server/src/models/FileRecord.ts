import { Schema, Types, model } from 'mongoose';

export interface IFileRecord {
  roomId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storedName: string;
  iv: string;
  tag: string;
  uploaderId: Types.ObjectId;
  uploaderName: string;
  createdAt: Date;
}

const schema = new Schema<IFileRecord>(
  {
    roomId: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    storedName: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploaderName: { type: String, required: true },
  },
  { timestamps: true },
);

export const FileRecord = model<IFileRecord>('FileRecord', schema);
