import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class StorageService implements OnModuleInit {
    private configService;
    private minioClient;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    getPresignedPutUrl(bucket: string, fileName: string): Promise<string>;
    ensureBucketExists(bucket: string): Promise<void>;
}
