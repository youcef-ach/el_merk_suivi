import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private minioClient: Minio.Client;

  constructor(private configService: ConfigService) {
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists('virtual-tours');
    await this.ensureBucketExists('virtual-inspections');
  }

  /**
   * Generates a pre-signed URL for uploading a file directly to MinIO.
   * By default, it grants 1 hour (3600 seconds) for the client to perform a PUT request.
   * 
   * @param bucket - The target bucket name (e.g., 'virtual-tours').
   * @param fileName - Target filename/path inside the bucket.
   * @returns Pre-signed URL string.
   */
  async getPresignedPutUrl(bucket: string, fileName: string): Promise<string> {
    try {
      return await this.minioClient.presignedPutObject(bucket, fileName, 3600);
    } catch (error) {
      throw new InternalServerErrorException(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * (Optional Utility) Checks if bucket exists, creating it if necessary.
   * Normally handled via docker-compose init, but good as a fallback.
   */
  async ensureBucketExists(bucket: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucket);
      if (!exists) {
        await this.minioClient.makeBucket(bucket, 'us-east-1');
      }
      
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['s3:GetObject'],
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      };
      await this.minioClient.setBucketPolicy(bucket, JSON.stringify(policy));

    } catch (error) {
      throw new InternalServerErrorException(`Failed to verify bucket: ${error.message}`);
    }
  }

  /**
   * Uploads a buffer directly to MinIO.
   * 
   * @param bucket - The target bucket name.
   * @param fileName - Target filename/path inside the bucket.
   * @param buffer - The file buffer.
   * @param contentType - The MIME type of the file.
   */
  async uploadBuffer(bucket: string, fileName: string, buffer: Buffer, contentType: string = 'application/octet-stream'): Promise<void> {
    try {
      await this.minioClient.putObject(bucket, fileName, buffer, buffer.length, {
        'Content-Type': contentType,
      });
    } catch (error) {
      throw new InternalServerErrorException(`Failed to upload buffer: ${error.message}`);
    }
  }
}
