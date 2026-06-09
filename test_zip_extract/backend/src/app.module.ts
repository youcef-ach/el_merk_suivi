import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { EnterprisesModule } from './modules/enterprises/enterprises.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    // Global Config mapping .env exactly as needed
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    EnterprisesModule,
    ProjectsModule,
    StorageModule,
    InspectionsModule,
  ],
})
export class AppModule {}
