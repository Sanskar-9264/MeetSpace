import { Schema, Types, model } from 'mongoose';

export interface IRoom {
  roomId: string;
  name: string;
  owner: Types.ObjectId;
  members: Types.ObjectId[];
  createdAt: Date;
}

const schema = new Schema<IRoom>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

export const Room = model<IRoom>('Room', schema);
