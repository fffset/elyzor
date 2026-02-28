import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır' })
  @MaxLength(128)
  password!: string;
}
