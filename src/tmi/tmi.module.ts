import { Module, forwardRef } from '@nestjs/common';
import { TmiService } from './tmi.service';
import { MatchesModule } from '../matches/matches.module';
import { CommonModule } from '../common/common.module';
import { PlayersModule } from 'src/players/players.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [TmiService],
  imports: [
    ConfigModule,
    PlayersModule,
    forwardRef(() => MatchesModule),
    forwardRef(() => CommonModule),
  ],
  exports: [TmiService],
})
export class TmiModule {}
