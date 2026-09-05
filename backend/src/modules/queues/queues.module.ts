import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ASSET_PROCESSING_QUEUE } from './queue.constants';
import { AssetProcessingProcessor } from './asset-processing.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { InspectionsModule } from '../inspections/inspections.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => InspectionsModule),
    BullModule.registerQueue({
      name: ASSET_PROCESSING_QUEUE,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [AssetProcessingProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
