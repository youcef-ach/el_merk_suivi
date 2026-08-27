import { Module } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { InspectionsDirectController } from './inspections-direct.controller';
import { TagsController } from './tags.controller';
import { AreaPointersController } from './area-pointers.controller';
import { PanoramasController } from './panoramas.controller';
import { StagingController } from './staging.controller';
import { SurveyDataController } from './survey-data.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [
    InspectionsController,
    InspectionsDirectController,
    TagsController,
    PanoramasController,
    AreaPointersController,
    StagingController,
    SurveyDataController,
  ],
  providers: [InspectionsService],
})
export class InspectionsModule {}

