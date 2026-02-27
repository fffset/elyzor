import { Schema, model } from 'mongoose';
import { IProject } from './projects.types';

const projectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const ProjectModel = model<IProject>('Project', projectSchema);
