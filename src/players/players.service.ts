import { Injectable, Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common/exceptions';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { Player } from './entities/player.entity';

@Injectable()
export class PlayersService {
  private logger = new Logger('PlayersService');
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,
  ) {}

  async create(createPlayerDto: CreatePlayerDto) {
    const player = this.playerRepository.create(createPlayerDto);
    try {
      await this.playerRepository.save(player);
      return player;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  findAll() {
    return `This action returns all players`;
  }

  async findOne(username: string) {
    const [player] = await this.playerRepository.find({
      where: { username },
      take: 1,
    });
    if (!player) throw new NotFoundException('Couldnt find player ' + username);
    return player;
  }

  async findOrCreate(username: string) {
    let player = await this.findOne(username).catch(() => {
      return this.create({ username });
    });
    return player;
  }

  async update(id: number, updatePlayerDto: UpdatePlayerDto) {
    await this.playerRepository.update(id, { points: updatePlayerDto.points });
    return true;
  }

  remove(id: number) {
    return `This action removes a #${id} player`;
  }

  async getElo(username: string) {
    try {
      const player = await this.findOne(username);
      return player.points;
    } catch (error) {
      return undefined;
    }
  }

  async getMostElo() {
    return this.playerRepository.find({
      order: {
        points: 'DESC',
      },

      take: 10,
    });
  }
}
