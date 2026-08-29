import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class StorageService implements OnModuleInit {
    private configService;
    private minioClient;
    private internalOrigin;
    private publicOrigin;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    getPresignedPutUrl(bucket: string, fileName: string): Promise<string>;
    ensureBucketExists(bucket: string): Promise<void>;
    uploadBuffer(bucket: string, fileName: string, buffer: Buffer, contentType?: string): Promise<void>;
    downloadFile(bucket: string, fileName: string, localFilePath: string): Promise<void>;
    uploadFile(bucket: string, fileName: string, localFilePath: string, contentType?: string): Promise<void>;
}
