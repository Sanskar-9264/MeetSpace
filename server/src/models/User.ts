import { Schema, model } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
}

const schema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', schema);
