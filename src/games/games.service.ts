import { Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { Game } from './entities/game.entity';
import { NotFoundException } from '@nestjs/common/exceptions';
import { MapsService } from '../maps/maps.service';
import { Inject } from '@nestjs/common/decorators';

@Injectable()
export class GamesService {
  private logger = new Logger('GamesService');
  constructor(
    @InjectRepository(Game) private readonly gameRepository: Repository<Game>,

    @Inject(forwardRef(() => MapsService))
    private readonly mapsService: MapsService,
  ) {}

  async create(createGameDto: CreateGameDto) {
    const game = this.gameRepository.create(createGameDto);
    try {
      await this.gameRepository.save(game);
      return game;
    } catch (error) {
      this.logger.error(error);
    }
  }

  //*Done
  findAll() {
    return this.gameRepository.find();
  }

  //*Done
  async findOne(id: number) {
    const [game] = await this.gameRepository.find({
      where: { id },
      relations: { maps: true },
    });

    if (!game) throw new NotFoundException();

    return game;
  }

  async findMaps(gameId: number) {
    return this.mapsService.findGameMaps(gameId);
  }

  update(id: number, updateGameDto: UpdateGameDto) {
    return `This action updates a #${id} game`;
  }

  //* Done
  async remove(id: number) {
    await this.gameRepository.softDelete({ id });
  }
}
