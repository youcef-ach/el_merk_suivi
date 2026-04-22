import { Module } from '@nestjs/common';
import { ToursService } from './tours.service';
import { ToursController } from './tours.controller';
import { TagsController } from './tags.controller';
import { AreaPointersController } from './area-pointers.controller';
import { PanoramasController } from './panoramas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ToursController, TagsController, PanoramasController, AreaPointersController],
  providers: [ToursService],
})
export class ToursModule {}

