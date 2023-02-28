import { Module, forwardRef } from '@nestjs/common';
import { TmiService } from './tmi.service';
import { PlayersModule } from '../players/players.module';
import { PlayersService } from '../players/players.service';

@Module({
  providers: [TmiService, PlayersService],
  imports: [PlayersModule],
})
export class TmiModule {}
