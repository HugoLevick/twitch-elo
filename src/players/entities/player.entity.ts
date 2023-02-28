import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column('numeric', {
    default: 100,
    nullable: false,
  })
  points: number;
}
