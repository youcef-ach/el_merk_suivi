import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InspectionsService } from '../inspections/inspections.service';
import { 
  ASSET_PROCESSING_QUEUE, 
  JOB_PROCESS_GLB, 
  JOB_PROCESS_PANORAMAS, 
  JOB_PROCESS_TILESET 
} from './queue.constants';

@Processor(ASSET_PROCESSING_QUEUE, { concurrency: 1 })
@Injectable()
export class AssetProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspectionsService: InspectionsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { inspectionId, userEnterpriseId, role, fileName, compressionMode } = job.data;
    this.logger.log(`Starting job ${job.name} [ID: ${job.id}] for inspection ${inspectionId}`);

    try {
      if (job.name === JOB_PROCESS_GLB) {
        await this.prisma.inspection.update({
          where: { id: inspectionId },
          data: {
            processingStatus: 'PROCESSING',
            processingProgress: 10,
            processingStage: 'Analyzing 3D model geometry and textures...',
            processingError: null,
          },
        });
        await job.updateProgress(10);

        const result = await this.inspectionsService.processGlb(
          inspectionId,
          userEnterpriseId,
          role,
          fileName,
          compressionMode,
          async (progress: number, stage: string) => {
            await job.updateProgress(progress);
            await this.prisma.inspection.update({
              where: { id: inspectionId },
              data: { processingProgress: progress, processingStage: stage },
            });
          },
        );

        await this.prisma.inspection.update({
          where: { id: inspectionId },
          data: {
            processingStatus: 'COMPLETED',
            processingProgress: 100,
            processingStage: '3D Digital Twin optimized successfully',
          },
        });
        await job.updateProgress(100);
        return result;
      }

      if (job.name === JOB_PROCESS_PANORAMAS) {
        await this.prisma.inspection.update({
          where: { id: inspectionId },
          data: {
            processingStatus: 'PROCESSING',
            processingProgress: 5,
            processingStage: 'Extracting panorama archive...',
            processingError: null,
          },
        });
        await job.updateProgress(5);

        const result = await this.inspectionsService.processPanoramas(
          inspectionId,
          userEnterpriseId,
          role,
          async (progress: number, stage: string) => {
            await job.updateProgress(progress);
            await this.prisma.inspection.update({
              where: { id: inspectionId },
              data: { processingProgress: progress, processingStage: stage },
            });
          },
        );

        await this.prisma.inspection.update({
          where: { id: inspectionId },
          data: {
            processingStatus: 'COMPLETED',
            processingProgress: 100,
            processingStage: 'All multi-LOD panoramas and KTX2 cubemaps ready',
          },
        });
        await job.updateProgress(100);
        return result;
      }

      if (job.name === JOB_PROCESS_TILESET) {
        await this.prisma.inspection.update({
          where: { id: inspectionId },
          data: {
            processingStatus: 'PROCESSING',
            processingProgress: 20,
            processingStage: 'Extracting and verifying 3D Tileset...',
            processingError: null,
          },
        });
        const result = await this.inspectionsService.processTileset(inspectionId, userEnterpriseId, role);
        await this.prisma.inspection.update({
          where: { id: inspectionId },
          data: {
            processingStatus: 'COMPLETED',
            processingProgress: 100,
            processingStage: '3D Tileset ready',
          },
        });
        return result;
      }
    } catch (err: any) {
      this.logger.error(`Job ${job.name} [ID: ${job.id}] failed: ${err.message}`, err.stack);
      await this.prisma.inspection.update({
        where: { id: inspectionId },
        data: {
          processingStatus: 'FAILED',
          processingError: err.message || 'Processing failed',
        },
      });
      throw err;
    }
  }
}
