import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity';
import { PlayersModule } from '../players/players.module';
import { CommonModule } from '../common/common.module';
import { TmiModule } from '../tmi/tmi.module';
import { MapsModule } from '../maps/maps.module';
import { MatchTeams } from './entities/matches-teams.entity';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService],
  imports: [
    TypeOrmModule.forFeature([Match, MatchTeams]),
    PlayersModule,
    CommonModule,
    TmiModule,
    MapsModule,
  ],
  exports: [TypeOrmModule, MatchesService],
})
export class MatchesModule {}
