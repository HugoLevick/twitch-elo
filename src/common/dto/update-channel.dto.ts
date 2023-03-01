import {
  IsOptional,
  IsString,
  MinLength,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateOptionsDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  bottedChannel: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  pickOrder: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  playersPerTeam: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  gameId: number;

  //How many seconds have to pass to cancel a match in votation / pick phase
  @IsNumber()
  @Min(0)
  @IsOptional()
  cancelMatchTimeout: number;
}
