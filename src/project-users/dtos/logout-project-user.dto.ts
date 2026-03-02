import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LogoutProjectUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Access token zorunludur' })
  @MaxLength(512)
  accessToken!: string;
}
