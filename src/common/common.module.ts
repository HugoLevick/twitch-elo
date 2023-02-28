import { Module, forwardRef } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { PlayersModule } from '../players/players.module';
import { MatchesModule } from '../matches/matches.module';
import { TmiModule } from '../tmi/tmi.module';

@Module({
  controllers: [CommonController],
  providers: [CommonService],
  imports: [
    PlayersModule,
    forwardRef(() => MatchesModule),
    forwardRef(() => TmiModule),
  ],
  exports: [CommonService],
})
export class CommonModule {}
