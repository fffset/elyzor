import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'Servis adı zorunludur' })
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Servis adı yalnızca küçük harf, rakam ve tire içerebilir' })
  name!: string;
}
