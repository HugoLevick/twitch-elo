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

  update(id: number, updatePlayerDto: UpdatePlayerDto) {
    return `This action updates a #${id} player`;
  }

  remove(id: number) {
    return `This action removes a #${id} player`;
  }
}
