import {
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  ManyToOne,
  DeleteDateColumn,
  CreateDateColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Player } from '../../players/entities/player.entity';
import { GameMap } from '../../maps/entities/map.entity';
import { MatchTeams } from './matches-teams.entity';

export enum MatchStatuses {
  queueing = 'QUEUEING',
  inProgress = 'IN_PROGRESS',
  ended = 'ENDED',
  canceled = 'CANCELED',
}

@Entity()
export class Match {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('enum', {
    enum: MatchStatuses,
    default: MatchStatuses.queueing,
  })
  status: MatchStatuses;

  @ManyToOne(() => GameMap, (map) => map.matches, {
    eager: true,
  })
  map: GameMap;

  @ManyToMany(() => Player, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinTable()
  players: Player[];

  @OneToMany(() => MatchTeams, (team) => team.match, {
    onDelete: 'CASCADE',
  })
  teams: MatchTeams[];

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
