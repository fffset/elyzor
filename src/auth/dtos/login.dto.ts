import { IsEmail, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Şifre boş olamaz' })
  @MaxLength(128)
  password!: string;
}
