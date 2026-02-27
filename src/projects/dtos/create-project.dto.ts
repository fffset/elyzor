import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Proje adı zorunludur' })
  @MaxLength(100)
  name!: string;
}
