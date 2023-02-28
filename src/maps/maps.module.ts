import { Module } from '@nestjs/common';
import { MapsService } from './maps.service';
import { MapsController } from './maps.controller';
import { GameMap } from './entities/map.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from '../games/games.service';
import { GamesModule } from '../games/games.module';

@Module({
  controllers: [MapsController],
  providers: [MapsService, GamesService],
  imports: [TypeOrmModule.forFeature([GameMap]), GamesModule],
  exports: [TypeOrmModule],
})
export class MapsModule {}
