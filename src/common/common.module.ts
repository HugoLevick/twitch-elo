import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { TmiService } from '../tmi/tmi.service';
import { PlayersModule } from '../players/players.module';
import { PlayersService } from '../players/players.service';

@Module({
  controllers: [CommonController],
  providers: [CommonService, TmiService, PlayersService],
  exports: [CommonService],
  imports: [PlayersModule],
})
export class CommonModule {}
