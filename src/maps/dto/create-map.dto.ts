import { IsNumber, IsString, MinLength } from 'class-validator';
export class CreateMapDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  gameId: number;
}
