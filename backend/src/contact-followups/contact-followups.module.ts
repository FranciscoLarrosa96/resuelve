import { Module } from '@nestjs/common';
import { ContactFollowupsController } from './contact-followups.controller';

@Module({ controllers: [ContactFollowupsController] })
export class ContactFollowupsModule {}
