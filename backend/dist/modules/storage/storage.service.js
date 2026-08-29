"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const Minio = require("minio");
let StorageService = class StorageService {
    constructor(configService) {
        this.configService = configService;
        const endpoint = this.configService.get('MINIO_ENDPOINT', 'localhost');
        const port = parseInt(this.configService.get('MINIO_PORT', '9000'), 10);
        const useSSL = this.configService.get('MINIO_USE_SSL') === 'true';
        this.minioClient = new Minio.Client({
            endPoint: endpoint,
            port,
            useSSL,
            accessKey: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
            secretKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
        });
        const scheme = useSSL ? 'https' : 'http';
        this.internalOrigin = `${scheme}://${endpoint}:${port}`;
        const publicEndpoint = this.configService.get('MINIO_PUBLIC_ENDPOINT');
        if (publicEndpoint) {
            const publicPort = this.configService.get('MINIO_PUBLIC_PORT', '80');
            const publicSSL = this.configService.get('MINIO_PUBLIC_SSL') === 'true';
            const publicScheme = publicSSL ? 'https' : 'http';
            const portSuffix = (publicPort === '80' && !publicSSL) || (publicPort === '443' && publicSSL)
                ? ''
                : `:${publicPort}`;
            this.publicOrigin = `${publicScheme}://${publicEndpoint}${portSuffix}`;
        }
        else {
            this.publicOrigin = this.internalOrigin;
        }
    }
    async onModuleInit() {
        console.log(`[StorageService] Internal Origin: ${this.internalOrigin}`);
        console.log(`[StorageService] Public Origin: ${this.publicOrigin}`);
        await this.ensureBucketExists('virtual-tours');
        await this.ensureBucketExists('virtual-inspections');
    }
    async getPresignedPutUrl(bucket, fileName) {
        try {
            const url = await this.minioClient.presignedPutObject(bucket, fileName, 3600);
            return url.replace(this.internalOrigin, this.publicOrigin);
        }
        catch (error) {
            console.error('getPresignedPutUrl error:', error);
            throw new common_1.InternalServerErrorException(`Failed to generate presigned URL: ${error.message}`);
        }
    }
    async ensureBucketExists(bucket) {
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
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(`Failed to verify bucket: ${error.message}`);
        }
    }
    async uploadBuffer(bucket, fileName, buffer, contentType = 'application/octet-stream') {
        try {
            await this.minioClient.putObject(bucket, fileName, buffer, buffer.length, {
                'Content-Type': contentType,
            });
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(`Failed to upload buffer: ${error.message}`);
        }
    }
    async downloadFile(bucket, fileName, localFilePath) {
        try {
            await this.minioClient.fGetObject(bucket, fileName, localFilePath);
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(`Failed to download file from MinIO: ${error.message}`);
        }
    }
    async uploadFile(bucket, fileName, localFilePath, contentType = 'application/octet-stream') {
        try {
            await this.minioClient.fPutObject(bucket, fileName, localFilePath, {
                'Content-Type': contentType,
            });
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(`Failed to upload file to MinIO: ${error.message}`);
        }
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StorageService);
//# sourceMappingURL=storage.service.js.map