import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body parser limits for large JSON payloads (e.g. scan processing)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Enable CORS for frontend connectivity
  app.enableCors({
    origin: '*', // Set to specific frontend origin in production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global pipe for strict DTO checking via class-validator
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,              // Strip out unknown properties
    forbidNonWhitelisted: true,   // Throw exception if unknown property is provided
    transform: true,              // Automatically transform payloads to DTO instances
  }));

  await app.listen(3000);
}
bootstrap();
