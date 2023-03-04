import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MatchesModule } from './matches/matches.module';
import { PlayersModule } from './players/players.module';
import { TmiModule } from './tmi/tmi.module';
import { CommonModule } from './common/common.module';
import { GamesModule } from './games/games.module';
import { MapsModule } from './maps/maps.module';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),

    TmiModule,

    MatchesModule,

    ConfigModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      autoLoadEntities: true,
      synchronize: true,
    }),

    PlayersModule,

    GamesModule,

    MapsModule,

    CommonModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [TypeOrmModule, ConfigModule],
})
export class AppModule {}
