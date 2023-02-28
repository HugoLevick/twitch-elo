import { IsString, MinLength } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @MinLength(1)
  name: string;
}
