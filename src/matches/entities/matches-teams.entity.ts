import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { Player } from '../../players/entities/player.entity';

export enum MatchesTeamsEnum {
  a = 'A',
  b = 'B',
}

@Entity()
export class MatchTeams {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('enum', {
    enum: MatchesTeamsEnum,
    nullable: false,
  })
  letter: MatchesTeamsEnum;

  @ManyToOne(() => Match, (match) => match.teams, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  match: Match;

  @ManyToOne(() => Player, (player) => player.teams, {
    eager: true,
    nullable: false,
  })
  captain: Player;

  @ManyToMany(() => Player, {
    eager: true,
    nullable: false,
  })
  @JoinTable()
  players: Player[];

  @DeleteDateColumn()
  deletedAt: Date;
}
