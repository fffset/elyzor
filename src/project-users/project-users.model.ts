import { Schema, model } from 'mongoose';
import { IProjectUser } from './project-users.types';

const projectUserSchema = new Schema<IProjectUser>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

// Aynı email farklı projelere kayıt olabilir; aynı proje içinde email unique
projectUserSchema.index({ projectId: 1, email: 1 }, { unique: true });

export const ProjectUserModel = model<IProjectUser>('ProjectUser', projectUserSchema);
