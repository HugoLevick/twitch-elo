import { IsBoolean, IsString } from 'class-validator';

export class AddDevDto {
  @IsString({ each: true })
  players: string[];

  @IsBoolean()
  skipVote: boolean;
}
