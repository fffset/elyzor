import { UserModel } from './users.model';
import { IUser } from './users.types';

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email });
  }

  async findById(id: string): Promise<IUser | null> {
    return UserModel.findById(id);
  }

  async create(data: { email: string; passwordHash: string }): Promise<IUser> {
    return UserModel.create(data);
  }
}
