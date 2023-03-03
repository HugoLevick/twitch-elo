import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, Min } from 'class-validator';
import { CreatePlayerDto } from './create-player.dto';

export class UpdatePlayerDto extends PartialType(CreatePlayerDto) {
  @IsNumber()
  @Min(0)
  points: number;
}
