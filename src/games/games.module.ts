import { forwardRef, Module } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from './entities/game.entity';
import { MapsModule } from '../maps/maps.module';

@Module({
  controllers: [GamesController],
  providers: [GamesService],
  imports: [TypeOrmModule.forFeature([Game]), forwardRef(() => MapsModule)],
  exports: [TypeOrmModule, GamesService],
})
export class GamesModule {}
