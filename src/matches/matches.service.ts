import { Injectable } from '@nestjs/common';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Match, MatchStatuses } from './entities/match.entity';
import { Equal, Repository } from 'typeorm';
import { PlayersService } from '../players/players.service';
import { BadRequestException } from '@nestjs/common/exceptions';
import { CommonService } from '../common/common.service';
import { ConflictException } from '@nestjs/common/exceptions/conflict.exception';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,

    private readonly playersService: PlayersService,

    private readonly commonService: CommonService,
  ) {}

  async create() {
    const match = this.matchesRepository.create({ players: [] });
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

  async addPlayerToQueue(username: string) {
    //TODO: Check if player is in a match in progress
    const playersPerTeam = this.commonService.options.playersPerTeam;
    const player = await this.playersService.findOrCreate(username);
    let match = await this.findLatest();
    if (!match) match = await this.create();

    for (let matchPlayer of match.players) {
      if (matchPlayer.id === player.id)
        throw new BadRequestException(`${username} is already in a match`);
    }

    if (match.players.length >= playersPerTeam)
      throw new ConflictException(`Queue ${match.id} is full`);

    match.players.push(player);

    await this.matchesRepository.save(match);
    return { match, playersPerTeam };
  }

  async removePlayerFromQueue(username: string) {
    const playersPerTeam = this.commonService.options.playersPerTeam;
    const player = await this.playersService.findOne(username);
    let match = await this.findLatest();
    if (!match) return;

    const indexToDelete = match.players.findIndex((p) => p.id === player.id);
    if (indexToDelete === -1)
      throw new Error(username + ' was not in the queue');

    match.players.splice(indexToDelete, 1);

    await this.matchesRepository.save(match);

    return { match, playersPerTeam };
  }
}
