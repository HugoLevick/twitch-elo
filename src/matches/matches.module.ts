import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity';
import { PlayersModule } from '../players/players.module';
import { CommonModule } from '../common/common.module';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService],
  imports: [TypeOrmModule.forFeature([Match]), PlayersModule, CommonModule],
  exports: [TypeOrmModule, MatchesService],
})
export class MatchesModule {}
