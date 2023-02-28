import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity';
import { PlayersService } from '../players/players.service';
import { PlayersModule } from '../players/players.module';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, PlayersService],
  imports: [TypeOrmModule.forFeature([Match]), PlayersModule],
  exports: [TypeOrmModule],
})
export class MatchesModule {}
