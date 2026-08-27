import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private minioClient: Minio.Client;

  /** The internal MinIO origin that appears in presigned URLs (e.g. "http://minio:9000"). */
  private internalOrigin: string;

  /** The public origin to replace it with (e.g. "http://197.140.41.131"). */
  private publicOrigin: string;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = parseInt(this.configService.get<string>('MINIO_PORT', '9000'), 10);
    const useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';

    this.minioClient = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });

    // Build the internal origin string that will appear in presigned URLs
    const scheme = useSSL ? 'https' : 'http';
    this.internalOrigin = `${scheme}://${endpoint}:${port}`;

    // Build the public origin – if not set, presigned URLs are returned as-is
    const publicEndpoint = this.configService.get<string>('MINIO_PUBLIC_ENDPOINT');
    if (publicEndpoint) {
      const publicPort = this.configService.get<string>('MINIO_PUBLIC_PORT', '80');
      const publicSSL = this.configService.get<string>('MINIO_PUBLIC_SSL') === 'true';
      const publicScheme = publicSSL ? 'https' : 'http';
      // Omit :80 for http and :443 for https (standard ports)
      const portSuffix = (publicPort === '80' && !publicSSL) || (publicPort === '443' && publicSSL)
        ? ''
        : `:${publicPort}`;
      this.publicOrigin = `${publicScheme}://${publicEndpoint}${portSuffix}`;
    } else {
      this.publicOrigin = this.internalOrigin; // no rewrite
    }
  }

  async onModuleInit() {
    console.log(`[StorageService] Internal Origin: ${this.internalOrigin}`);
    console.log(`[StorageService] Public Origin: ${this.publicOrigin}`);
    await this.ensureBucketExists('virtual-tours');
    await this.ensureBucketExists('virtual-inspections');
  }

  /**
   * Generates a pre-signed URL for uploading a file directly to MinIO.
   * The internal hostname is replaced with the public-facing one so
   * browsers can reach it through the Nginx reverse proxy.
   */
  async getPresignedPutUrl(bucket: string, fileName: string): Promise<string> {
    try {
      const url = await this.minioClient.presignedPutObject(bucket, fileName, 3600);
      // Replace http://minio:9000 → http://197.140.41.131
      return url.replace(this.internalOrigin, this.publicOrigin);
    } catch (error) {
      console.error('getPresignedPutUrl error:', error);
      throw new InternalServerErrorException(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Checks if bucket exists, creating it if necessary.
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

  /**
   * Downloads an object from MinIO directly to the local filesystem.
   */
  async downloadFile(bucket: string, fileName: string, localFilePath: string): Promise<void> {
    try {
      await this.minioClient.fGetObject(bucket, fileName, localFilePath);
    } catch (error) {
      throw new InternalServerErrorException(`Failed to download file from MinIO: ${error.message}`);
    }
  }

  /**
   * Uploads a local file directly to MinIO.
   */
  async uploadFile(bucket: string, fileName: string, localFilePath: string, contentType: string = 'application/octet-stream'): Promise<void> {
    try {
      await this.minioClient.fPutObject(bucket, fileName, localFilePath, {
        'Content-Type': contentType,
      });
    } catch (error) {
      throw new InternalServerErrorException(`Failed to upload file to MinIO: ${error.message}`);
    }
  }
}
