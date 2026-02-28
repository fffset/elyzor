import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginProjectUserDto {
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
