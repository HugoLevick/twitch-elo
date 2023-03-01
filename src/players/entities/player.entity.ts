import {
  Column,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { MatchTeams } from '../../matches/entities/matches-teams.entity';

@Entity()
export class Player {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('varchar', {
    nullable: false,
    unique: true,
    length: 50,
  })
  username: string;

  @Column('int', {
    default: 100,
    nullable: false,
  })
  points: number;

  @OneToMany(() => MatchTeams, (team) => team.captain)
  teams: MatchTeams[];
}
