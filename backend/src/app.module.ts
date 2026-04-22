import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ToursModule } from './modules/tours/tours.module';
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
    StorageModule,
    ToursModule,
  ],
})
export class AppModule {}
