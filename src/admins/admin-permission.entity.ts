import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * What one admin is allowed to do. Kept beside users rather than on it because
 * the users table is owned by the consumer app and carries every role; only
 * admins ever get a row here.
 */
@Entity('admin_permissions')
export class AdminPermission {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true })
  @Column() userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' }) user: User;

  /** Granted permission keys. Ignored entirely when isSuper is true. */
  @Column({ type: 'simple-array', default: '' }) permissions: string[];

  /** Holds every permission, present and future, and cannot be locked out. */
  @Column({ default: false }) isSuper: boolean;

  @Column({ nullable: true }) createdById: string;

  @Column({ nullable: true }) note: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
