import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateOptionsDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  bottedChannel: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  pickOrder: string;
}
