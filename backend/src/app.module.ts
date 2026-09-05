import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { EnterprisesModule } from './modules/enterprises/enterprises.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueuesModule } from './modules/queues/queues.module';

@Module({
  imports: [
    // Global Config mapping .env exactly as needed
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: Number(configService.get<number>('REDIS_PORT', 6379)),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    EnterprisesModule,
    ProjectsModule,
    StorageModule,
    QueuesModule,
    InspectionsModule,
  ],
})
export class AppModule {}
