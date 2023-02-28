import { Injectable } from '@nestjs/common';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Match, MatchStatuses } from './entities/match.entity';
import { Equal, Repository } from 'typeorm';
import { PlayersService } from '../players/players.service';
import { BadRequestException } from '@nestjs/common/exceptions';
import { CommonService } from '../common/common.service';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,

    private readonly playersService: PlayersService,

    private readonly CommonService,
  ) {}

  async create() {
    const match = this.matchesRepository.create();
    await this.matchesRepository.save(match);
    return match;
  }

  findAll() {
    return `This action returns all matches`;
  }

  findOne(id: number) {
    return `This action returns a #${id} match`;
  }

  async findLatest() {
    const [match] = await this.matchesRepository.find({
      where: { status: Equal(MatchStatuses.queueing) },
      order: { id: 'DESC' },
      take: 1,
    });
    return match;
  }

  update(id: number, updateMatchDto: UpdateMatchDto) {
    return `This action updates a #${id} match`;
  }

  remove(id: number) {
    return `This action removes a #${id} match`;
  }

  async addPlayerToMatch(username: string) {
    const player = await this.playersService.findOne(username);
    let match = await this.findLatest();
    if (!match) match = await this.create();

    for (let matchPlayer of match.players) {
      if (matchPlayer.id === player.id)
        throw new BadRequestException(`${username} is already in a match`);
    }
  }
}
