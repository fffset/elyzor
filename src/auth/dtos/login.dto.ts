import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Şifre boş olamaz' })
  password!: string;
}
