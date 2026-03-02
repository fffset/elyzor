import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LogoutAllProjectUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Kullanıcı ID zorunludur' })
  @MaxLength(100)
  userId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Access token zorunludur' })
  @MaxLength(512)
  accessToken!: string;
}
