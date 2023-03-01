import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Equal } from 'typeorm';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';
import { GameMap } from './entities/map.entity';
import { GamesService } from '../games/games.service';
import { InternalServerErrorException } from '@nestjs/common/exceptions';
import { NotFoundException } from '@nestjs/common/exceptions';

@Injectable()
export class MapsService {
  private logger = new Logger('MapsService');

  constructor(
    @InjectRepository(GameMap)
    private readonly mapsRepository: Repository<GameMap>,
    private readonly gamesService: GamesService,
  ) {}

  async create(createMapDto: CreateMapDto) {
    const { name, gameId } = createMapDto;

    const map = this.mapsRepository.create({
      name,
      game: { id: gameId },
    });

    try {
      await this.mapsRepository.save(map);
      return map;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException();
    }
  }

  findAll() {
    return this.mapsRepository.find();
  }

  async findOne(id: number) {
    const [map] = await this.mapsRepository.find({ where: { id }, take: 1 });
    if (!map) throw new NotFoundException();
    return map;
  }

  async findGameMaps(gameId: number) {
    return this.mapsRepository.find({ where: { game: Equal(gameId) } });
  }

  update(id: number, updateMapDto: UpdateMapDto) {
    return `This action updates a #${id} map`;
  }

  async remove(id: number) {
    this.mapsRepository.softDelete({ id });
    return true;
  }
}
