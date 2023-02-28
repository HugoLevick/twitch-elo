import { IsString, MinLength } from 'class-validator';

export class CreatePlayerDto {
  @IsString()
  @MinLength(1)
  username: string;
}
