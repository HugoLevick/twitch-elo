import { Module, forwardRef } from '@nestjs/common';
import { TmiService } from './tmi.service';
import { PlayersModule } from '../players/players.module';
import { MatchesModule } from '../matches/matches.module';
import { CommonModule } from '../common/common.module';

@Module({
  providers: [TmiService],
  imports: [forwardRef(() => MatchesModule), forwardRef(() => CommonModule)],
  exports: [TmiService],
})
export class TmiModule {}
