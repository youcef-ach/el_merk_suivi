import { Injectable, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
import { UpdateInspectionPermissionsDto } from './dto/update-inspection-permissions.dto';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
import { UpdateSurveyMetaDto } from './dto/survey-meta.dto';
import { CreateSurveyReportDto } from './dto/create-survey-report.dto';
import { CreateCrossSectionDto } from './dto/create-cross-section.dto';
import { CreateSiteMeasurementDto } from './dto/create-site-measurement.dto';
import { Visibility, Role, ProcessingStatus } from '@prisma/client';

@Injectable()
export class InspectionsService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async create(projectId: string, createInspectionDto: CreateInspectionDto, userEnterpriseId: string) {
    const data: any = {
      ...createInspectionDto,
      projectId,
    };
    if (createInspectionDto.surveyDate) {
      data.surveyDate = new Date(createInspectionDto.surveyDate);
    }
    return this.prisma.inspection.create({ data });
  }

  async findAll(projectId: string, user?: { id: string; role: Role }) {
    if (!user) {
      return this.prisma.inspection.findMany({
        where: { projectId, visibility: Visibility.PUBLIC },
      });
    }

    if (user.role === Role.ADMIN) {
      return this.prisma.inspection.findMany({ where: { projectId } }); 
    }

    return this.prisma.inspection.findMany({
      where: {
        projectId,
        OR: [
          { visibility: Visibility.PUBLIC },
          // { userEnterpriseId: user.id }, // Removed userEnterpriseId. We should check if user's enterprise owns the project.
          { authorizedViewers: { some: { id: user.id } } },
        ],
      },
    });
  }

  async findOne(id: string, user?: { id: string; role: Role; enterpriseId?: string }) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        project: true,
        scans: true,
        tags: { include: { documents: true } },
        panoramas: true,
        areaPointers: true,
        surveyReports: true,
        crossSections: true,
        siteMeasurements: true,
        authorizedViewers: true,
        stagingProfiles: {
          include: {
            stagedItems: true,
            bakedPanoramas: true
          }
        },
      },
    });

    if (!inspection) {
      throw new NotFoundException('Inspection not found');
    }

    if (inspection.visibility === Visibility.PUBLIC) {
      return inspection;
    }

    // Private inspection logic requires an authenticated user
    if (!user) {
      throw new ForbiddenException('You must be logged in to access this private inspection');
    }

    // Admins and creators always bypass
    if (user.role === Role.ADMIN || inspection.project?.enterpriseId === user.enterpriseId) {
      return inspection;
    }

    // Check if user is in authorizedViewers
    const isAuthorized = inspection.authorizedViewers.some((v) => v.id === user.id);
    if (!isAuthorized) {
      throw new ForbiddenException('You are not authorized to view this private inspection');
    }

    return inspection;
  }

  async getBundle(id: string, user?: { id: string; role: Role }) {
    // getBundle strictly leverages findOne to enforce all access control logic securely
    const inspection = await this.findOne(id, user);

    // Any customized shaping for the 3D Engine is handled here.
    // Right now, findOne correctly returns the entire tree of panoramas, tags, and scans natively.
    return inspection;
  }

  async clone(id: string, userEnterpriseId: string, role: Role) {
    const original = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        project: true,
        scans: true,
        panoramas: true,
        tags: { include: { documents: true } },
        areaPointers: true,
        authorizedViewers: true,
        stagingProfiles: {
          include: {
            stagedItems: true,
            bakedPanoramas: true
          }
        },
      },
    });

    if (!original) throw new NotFoundException('Inspection not found');

    if (original.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the enterprise admin can clone this inspection');
    }

    // Create the new inspection
    const newInspection = await this.prisma.inspection.create({
      data: {
        title: `${original.title} (Copy)`,
        description: original.description,
        glbModelUrl: original.glbModelUrl,
        scansJsonUrl: original.scansJsonUrl,
        thumbnailUrl: original.thumbnailUrl,
        videoUrl: original.videoUrl,
        visibility: original.visibility,
        projectId: original.projectId,
        authorizedViewers: {
          connect: original.authorizedViewers.map(v => ({ id: v.id }))
        }
      }
    });

    // 1. Clone Scans
    const oldToNewScanId = new Map<string, string>();
    for (const scan of original.scans) {
      const newScan = await this.prisma.scan.create({
        data: {
          posX: scan.posX,
          posY: scan.posY,
          posZ: scan.posZ,
          quatW: scan.quatW,
          quatX: scan.quatX,
          quatY: scan.quatY,
          quatZ: scan.quatZ,
          inspectionId: newInspection.id,
        }
      });
      oldToNewScanId.set(scan.id, newScan.id);
    }

    for (const scan of original.scans) {
      if (scan.targetScanId && oldToNewScanId.has(scan.targetScanId)) {
        await this.prisma.scan.update({
          where: { id: oldToNewScanId.get(scan.id) },
          data: { targetScanId: oldToNewScanId.get(scan.targetScanId) }
        });
      }
    }

    // 2. Clone Panoramas
    for (const pan of original.panoramas) {
      await this.prisma.panorama.create({
        data: {
          imageUrl: pan.imageUrl,
          status: pan.status,
          inspectionId: newInspection.id,
        }
      });
    }

    // 3. Clone Area Pointers
    for (const ptr of original.areaPointers) {
      await this.prisma.areaPointer.create({
        data: {
          name: ptr.name,
          color: ptr.color,
          posX: ptr.posX,
          posY: ptr.posY,
          posZ: ptr.posZ,
          height: ptr.height,
          thickness: ptr.thickness,
          labelSize: ptr.labelSize,
          sizeX: ptr.sizeX,
          sizeY: ptr.sizeY,
          wallHeight: ptr.wallHeight,
          inspectionId: newInspection.id,
        }
      });
    }

    // 4. Clone Tags and their Documents
    for (const tag of original.tags) {
      const newTag = await this.prisma.tag.create({
        data: {
          title: tag.title,
          description: tag.description,
          posX: tag.posX,
          posY: tag.posY,
          posZ: tag.posZ,
          icon: tag.icon,
          color: tag.color,
          size: tag.size,
          inspectionId: newInspection.id,
        }
      });
      
      for (const doc of tag.documents) {
        await this.prisma.tagDocument.create({
          data: {
            title: doc.title,
            fileUrl: doc.fileUrl,
            tagId: newTag.id,
          }
        });
      }
    }

    return newInspection;
  }

  async createScan(inspectionId: string, dto: CreateScanDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add a scan');
    }

    if (dto.targetScanId) {
      const targetScan = await this.prisma.scan.findUnique({ where: { id: dto.targetScanId } });
      if (!targetScan) throw new NotFoundException('Target scan not found');
      if (targetScan.inspectionId !== inspectionId) {
        throw new ForbiddenException('Target scan must belong to the same inspection');
      }
    }

    return this.prisma.scan.create({
      data: {
        ...dto,
        inspectionId,
      },
    });
  }

  async createPanorama(inspectionId: string, dto: CreatePanoramaDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add a panorama');
    }

    return this.prisma.panorama.create({
      data: {
        ...dto,
        status: ProcessingStatus.PENDING,
        inspectionId,
      },
    });
  }

  async updatePanoramaStatus(id: string, dto: UpdatePanoramaStatusDto, role: Role) {
    // Webhook should ideally be protected by a service token or Admin Role
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins or verified workers can update status');
    }

    const panorama = await this.prisma.panorama.findUnique({ where: { id } });
    if (!panorama) throw new NotFoundException('Panorama not found');

    return this.prisma.panorama.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async setPermissions(id: string, dto: UpdateInspectionPermissionsDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can update permissions');
    }

    return this.prisma.inspection.update({
      where: { id },
      data: {
        authorizedViewers: {
          set: dto.authorizedViewerIds.map((vId) => ({ id: vId })),
        },
      },
      include: { authorizedViewers: true }
    });
  }

  async remove(id: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete this inspection');
    }

    return this.prisma.inspection.delete({ where: { id } });
  }

  async update(id: string, dto: any, enterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project?.enterpriseId !== enterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the enterprise admin can update this inspection');
    }

    return this.prisma.inspection.update({
      where: { id },
      data: dto,
    });
  }

  async getUploadUrl(id: string, fileName: string, userEnterpriseId: string, role: Role) {
    try {
      const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
      if (!inspection) throw new NotFoundException('Inspection not found');

      if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
        throw new ForbiddenException('Only the creator or admin can upload files to this inspection');
      }

      // Use Minio StorageService
      const bucket = 'virtual-inspections';
      const s3Path = `inspections/${id}/${fileName}`;
      const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);

      // Optionally update the DB here if it's the main GLB model, or handle via a separate endpoint
      if (fileName && fileName.endsWith('.glb')) {
        await this.prisma.inspection.update({
          where: { id },
          data: { glbModelUrl: s3Path },
        });
      } else if (fileName && fileName.endsWith('scans.json')) {
        await this.prisma.inspection.update({
          where: { id },
          data: { scansJsonUrl: s3Path },
        });
      }

      return { presignedUrl, expectedPath: s3Path };
    } catch (error) {
      console.error('DEBUG: getUploadUrl error ->', error);
      throw error;
    }
  }

  async processAndUploadScans(id: string, mpData: any, rcData: any, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can upload files to this inspection');
    }

    // Process using the utility function
    const { processScans } = require('./utils/scan-processor.util');
    const processedData = processScans(mpData, rcData);
    const fileBuffer = Buffer.from(JSON.stringify(processedData, null, 2));
    
    // Also buffer the raw inputs for later reprocessing
    const mpBuffer = Buffer.from(JSON.stringify(mpData, null, 2));
    const rcBuffer = Buffer.from(JSON.stringify(rcData, null, 2));

    // Upload to Minio
    const bucket = 'virtual-inspections';
    const s3Path = `inspections/${id}/scans.json`;
    const rawScansS3Path = `inspections/${id}/raw_scans.json`;
    const rawCsvS3Path = `inspections/${id}/raw_csvjson.json`;
    
    await this.storageService.uploadBuffer(bucket, s3Path, fileBuffer, 'application/json');
    await this.storageService.uploadBuffer(bucket, rawScansS3Path, mpBuffer, 'application/json');
    await this.storageService.uploadBuffer(bucket, rawCsvS3Path, rcBuffer, 'application/json');

    // Update DB
    await this.prisma.inspection.update({
      where: { id },
      data: { 
        scansJsonUrl: s3Path,
        rawScansJsonUrl: rawScansS3Path,
        rawCsvJsonUrl: rawCsvS3Path
      },
    });

    return { success: true, s3Path, rawScansS3Path, rawCsvS3Path };
  }


  // ─── Tag CRUD ───────────────────────────────────────────────

  async createTag(inspectionId: string, dto: CreateTagDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add tags');
    }

    return this.prisma.tag.create({
      data: {
        title: dto.title,
        description: dto.description,
        posX: dto.posX,
        posY: dto.posY,
        posZ: dto.posZ,
        inspectionId,
      },
      include: { documents: true },
    });
  }

  async updateTag(inspectionId: string, tagId: string, dto: UpdateTagDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can edit tags');
    }

    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.inspectionId !== inspectionId) throw new NotFoundException('Tag not found in this inspection');

    return this.prisma.tag.update({
      where: { id: tagId },
      data: dto,
      include: { documents: true },
    });
  }

  async deleteTag(inspectionId: string, tagId: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete tags');
    }

    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.inspectionId !== inspectionId) throw new NotFoundException('Tag not found in this inspection');

    return this.prisma.tag.delete({ where: { id: tagId } });
  }

  async addTagDocument(inspectionId: string, tagId: string, dto: CreateTagDocumentDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can upload tag documents');
    }

    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.inspectionId !== inspectionId) throw new NotFoundException('Tag not found in this inspection');

    const bucket = 'virtual-inspections';
    const s3Path = `inspections/${inspectionId}/tags/${tagId}/${dto.fileName}`;
    const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);

    const document = await this.prisma.tagDocument.create({
      data: {
        title: dto.title,
        fileUrl: s3Path,
        tagId,
      },
    });

    return { presignedUrl, document };
  }

  async deleteTagDocument(inspectionId: string, tagId: string, docId: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete tag documents');
    }

    const doc = await this.prisma.tagDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.tagId !== tagId) throw new NotFoundException('Document not found on this tag');

    return this.prisma.tagDocument.delete({ where: { id: docId } });
  }

  // ─── Area Pointer CRUD ────────────────────────────────────────

  async createAreaPointer(inspectionId: string, dto: CreateAreaPointerDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add area pointers');
    }

    return this.prisma.areaPointer.create({
      data: {
        name: dto.name,
        color: dto.color,
        posX: dto.posX,
        posY: dto.posY,
        posZ: dto.posZ,
        inspectionId,
      },
    });
  }

  async updateAreaPointer(inspectionId: string, pointerId: string, dto: UpdateAreaPointerDto, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can edit area pointers');
    }

    const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
    if (!pointer || pointer.inspectionId !== inspectionId) throw new NotFoundException('Area pointer not found in this inspection');

    return this.prisma.areaPointer.update({
      where: { id: pointerId },
      data: dto,
    });
  }

  async deleteAreaPointer(inspectionId: string, pointerId: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete area pointers');
    }

    const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
    if (!pointer || pointer.inspectionId !== inspectionId) throw new NotFoundException('Area pointer not found in this inspection');

    return this.prisma.areaPointer.delete({ where: { id: pointerId } });
  }

  // ─── Staging Profiles CRUD ────────────────────────────────────────

  async createStagingProfile(inspectionId: string, name: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add staging profiles');
    }

    return this.prisma.stagingProfile.create({
      data: {
        name,
        inspectionId,
      },
    });
  }

  async getStagingProfile(inspectionId: string, profileId: string) {
    const profile = await this.prisma.stagingProfile.findUnique({
      where: { id: profileId },
      include: {
        stagedItems: true,
        bakedPanoramas: true
      },
    });

    if (!profile || profile.inspectionId !== inspectionId) {
      throw new NotFoundException('Staging profile not found in this inspection');
    }

    return profile;
  }

  async saveStagedItems(inspectionId: string, profileId: string, items: any[], userEnterpriseId: string, role: Role) {
    const profile = await this.getStagingProfile(inspectionId, profileId);
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can modify staging profiles');
    }

    // Replace all items in the profile (simple approach for bulk update)
    await this.prisma.stagedItem.deleteMany({
      where: { stagingProfileId: profileId },
    });

    if (items.length > 0) {
      await this.prisma.stagedItem.createMany({
        data: items.map(item => ({
          stagingProfileId: profileId,
          isPolyHaven: item.isPolyHaven,
          isSketchfab: item.isSketchfab,
          polyHavenId: item.polyHavenId,
          sketchfabId: item.sketchfabId,
          type: item.type,
          color: item.color,
          dimensions: item.dimensions,
          positionX: item.position[0],
          positionY: item.position[1],
          positionZ: item.position[2],
          rotationX: item.rotation[0],
          rotationY: item.rotation[1],
          rotationZ: item.rotation[2],
          scaleX: item.scale[0],
          scaleY: item.scale[1],
          scaleZ: item.scale[2],
        })),
      });
    }

    return this.getStagingProfile(inspectionId, profileId);
  }

  async saveBakedPanoramas(inspectionId: string, profileId: string, panoramas: any[], userEnterpriseId: string, role: Role) {
    const profile = await this.getStagingProfile(inspectionId, profileId);
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can modify staging profiles');
    }

    // Panoramas array is expected to be { scanId: string, face: string, imageUrl: string }
    for (const p of panoramas) {
      // Upsert based on scanId + face + profileId is best, but Prisma needs a unique constraint for upsert.
      // So we'll just delete existing and insert.
      await this.prisma.bakedPanorama.deleteMany({
        where: {
          stagingProfileId: profileId,
          scanId: p.scanId,
          face: p.face,
        },
      });

      await this.prisma.bakedPanorama.create({
        data: {
          stagingProfileId: profileId,
          scanId: p.scanId,
          face: p.face,
          imageUrl: p.imageUrl,
        },
      });
    }

    return this.getStagingProfile(inspectionId, profileId);
  }

  // ─── Drone Survey Operations ───

  async updateSurveyMeta(inspectionId: string, dto: UpdateSurveyMetaDto, userId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: { project: true },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');

    const updateData: any = { ...dto };
    if (dto.surveyDate) {
      updateData.surveyDate = new Date(dto.surveyDate);
    }

    return this.prisma.inspection.update({
      where: { id: inspectionId },
      data: updateData,
      include: {
        surveyReports: true,
        crossSections: true,
        siteMeasurements: true,
      },
    });
  }

  async createSurveyReport(inspectionId: string, dto: CreateSurveyReportDto, userId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    return this.prisma.surveyReport.create({
      data: {
        inspectionId,
        title: dto.title,
        reportType: dto.reportType,
        summary: dto.summary,
        fileUrl: dto.fileUrl,
      },
    });
  }

  async getSurveyReports(inspectionId: string, userId: string, role: Role) {
    return this.prisma.surveyReport.findMany({
      where: { inspectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSurveyReport(inspectionId: string, reportId: string, userId: string, role: Role) {
    return this.prisma.surveyReport.delete({
      where: { id: reportId },
    });
  }

  async createCrossSection(inspectionId: string, dto: CreateCrossSectionDto, userId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    return this.prisma.crossSection.create({
      data: {
        inspectionId,
        name: dto.name,
        startPoint: dto.startPoint,
        endPoint: dto.endPoint,
        sampleData: dto.sampleData,
        length: dto.length,
        minElev: dto.minElev,
        maxElev: dto.maxElev,
        slope: dto.slope,
      },
    });
  }

  async getCrossSections(inspectionId: string, userId: string, role: Role) {
    return this.prisma.crossSection.findMany({
      where: { inspectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteCrossSection(inspectionId: string, sectionId: string, userId: string, role: Role) {
    return this.prisma.crossSection.delete({
      where: { id: sectionId },
    });
  }

  async createSiteMeasurement(inspectionId: string, dto: CreateSiteMeasurementDto, userId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    return this.prisma.siteMeasurement.create({
      data: {
        inspectionId,
        type: dto.type,
        points: dto.points,
        values: dto.values,
        label: dto.label,
      },
    });
  }

  async getSiteMeasurements(inspectionId: string, userId: string, role: Role) {
    return this.prisma.siteMeasurement.findMany({
      where: { inspectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSiteMeasurement(inspectionId: string, measurementId: string, userId: string, role: Role) {
    return this.prisma.siteMeasurement.delete({
      where: { id: measurementId },
    });
  }

  async processTileset(id: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can process 3D tiles for this inspection');
    }

    const bucket = 'virtual-inspections';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tileset-'));
    const zipPath = path.join(tempDir, 'tileset.zip');

    try {
      // 1. Download tileset.zip from MinIO
      await this.storageService.downloadFile(bucket, `inspections/${id}/tileset.zip`, zipPath);

      // 2. Unzip using AdmZip
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      const extractDir = path.join(tempDir, 'extracted');
      zip.extractAllTo(extractDir, true);

      // 3. Intelligently locate the 3D Tiles root json file
      // Could be 'tileset.json', 'tileset_cesium_lods.json', 'tileset_textured_lods.json', etc.
      let rootJsonDir = extractDir;
      let rootJsonName = 'tileset.json';
      let foundJsonPath: string | null = null;

      const searchForTilesetJson = (dir: string): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (!entry.isDirectory() && entry.name.toLowerCase().endsWith('.json')) {
            try {
              const content = fs.readFileSync(full, 'utf-8');
              const parsed = JSON.parse(content);
              // Check if it matches 3D Tileset spec (has 'asset' and 'geometricError' or 'root')
              if (parsed.asset || parsed.root || parsed.geometricError !== undefined) {
                foundJsonPath = full;
                rootJsonDir = dir;
                rootJsonName = entry.name;
                return;
              }
            } catch (e) {
              // Not a valid JSON or parsing error, continue
            }
          }
          if (entry.isDirectory()) {
            searchForTilesetJson(full);
            if (foundJsonPath) return;
          }
        }
      };

      searchForTilesetJson(extractDir);

      // Fallback: If no 3D tiles JSON found with metadata, search for any json file
      if (!foundJsonPath) {
        const findAnyJson = (dir: string): void => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (!entry.isDirectory() && entry.name.toLowerCase().endsWith('.json')) {
              foundJsonPath = full;
              rootJsonDir = dir;
              rootJsonName = entry.name;
              return;
            }
            if (entry.isDirectory()) {
              findAnyJson(full);
              if (foundJsonPath) return;
            }
          }
        };
        findAnyJson(extractDir);
      }

      console.log(`[processTileset] Located 3D Tiles root at: ${rootJsonDir}, primary file: ${rootJsonName}`);

      // 4. Recursively upload all files to MinIO preserving relative paths from rootJsonDir
      const uploadRecursive = async (currDir: string, relPath: string = '') => {
        const entries = fs.readdirSync(currDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currDir, entry.name);
          const s3Rel = relPath ? `${relPath}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await uploadRecursive(fullPath, s3Rel);
          } else {
            // Auto-decompress gzip b3dm / pnts / i3dm files
            if (entry.name.endsWith('.b3dm') || entry.name.endsWith('.pnts') || entry.name.endsWith('.i3dm')) {
              try {
                const buf = fs.readFileSync(fullPath);
                if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
                  const decompressed = zlib.gunzipSync(buf);
                  fs.writeFileSync(fullPath, decompressed);
                  console.log(`[processTileset] Auto-decompressed gzip tile: ${entry.name} (${buf.length} -> ${decompressed.length} bytes)`);
                }
              } catch (e) {
                console.warn(`[processTileset] Gzip check error on ${entry.name}:`, e.message);
              }
            }

            // Auto-normalize JSON tilesets content.url -> content.uri
            if (entry.name.endsWith('.json')) {
              try {
                const buf = fs.readFileSync(fullPath);
                const json = JSON.parse(buf.toString('utf-8'));
                if (json.root) {
                  const normalizeNode = (node: any) => {
                    if (!node) return;
                    if (node.content) {
                      if (node.content.url && !node.content.uri) {
                        node.content.uri = node.content.url;
                      }
                    }
                    if (Array.isArray(node.children)) {
                      node.children.forEach(normalizeNode);
                    }
                  };
                  normalizeNode(json.root);
                  fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
                }
              } catch (e) {}
            }

            const s3Dest = `inspections/${id}/tileset/${s3Rel}`;
            let contentType = 'application/octet-stream';
            if (entry.name.endsWith('.json')) contentType = 'application/json';
            else if (entry.name.endsWith('.b3dm')) contentType = 'application/octet-stream';
            else if (entry.name.endsWith('.glb')) contentType = 'model/gltf-binary';
            else if (entry.name.endsWith('.pnts')) contentType = 'application/octet-stream';
            
            await this.storageService.uploadFile(bucket, s3Dest, fullPath, contentType);

            // If the primary json file is named something other than tileset.json, also create a 'tileset.json' alias
            if (currDir === rootJsonDir && entry.name === rootJsonName && rootJsonName !== 'tileset.json') {
              await this.storageService.uploadFile(bucket, `inspections/${id}/tileset/tileset.json`, fullPath, 'application/json');
            }
          }
        }
      };

      await uploadRecursive(rootJsonDir);

      // 5. Update inspection record with the tileset URL
      const relativeTilesetUrl = `inspections/${id}/tileset/${rootJsonName}`;
      await this.prisma.inspection.update({
        where: { id },
        data: { tilesetUrl: relativeTilesetUrl },
      });

      console.log(`[processTileset] 3D Tileset unpacked successfully. tilesetUrl = ${relativeTilesetUrl}`);
      return { status: 'SUCCESS', tilesetUrl: relativeTilesetUrl };
    } catch (err) {
      console.error(`[processTileset] Error:`, err);
      throw new InternalServerErrorException(`Failed to unpack 3D Tileset: ${err.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async processGlb(id: string, userEnterpriseId: string, role: Role, uploadedFileName: string = 'model.glb') {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can process 3D models for this inspection');
    }

    const bucket = 'virtual-inspections';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-opt-'));

    try {
      // 1. Determine uploaded file name on MinIO (e.g. model.zip, model.obj, model.glb)
      const candidateNames = [uploadedFileName, 'model.zip', 'model.obj', 'model.glb', 'model.gltf'];
      let downloadedPath = '';
      let downloadedName = '';

      for (const name of candidateNames) {
        if (!name) continue;
        const targetPath = path.join(tempDir, name);
        try {
          await this.storageService.downloadFile(bucket, `inspections/${id}/${name}`, targetPath);
          if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
            downloadedPath = targetPath;
            downloadedName = name;
            break;
          }
        } catch (e) {
          // Continue trying other candidates
        }
      }

      if (!downloadedPath) {
        throw new NotFoundException(`No uploaded 3D model found in inspections/${id}/`);
      }

      console.log(`[processGlb] Downloaded ${downloadedName} (${fs.statSync(downloadedPath).size} bytes)`);

      const extractDir = path.join(tempDir, 'extracted');
      fs.mkdirSync(extractDir, { recursive: true });

      let sourceGlbPath = '';

      if (downloadedName.toLowerCase().endsWith('.zip')) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(downloadedPath);
        zip.extractAllTo(extractDir, true);

        let foundObj: string | null = null;
        let foundGlb: string | null = null;

        const findModel = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              findModel(full);
            } else {
              const lower = entry.name.toLowerCase();
              if (lower.endsWith('.obj') && !foundObj) foundObj = full;
              if ((lower.endsWith('.glb') || lower.endsWith('.gltf')) && !foundGlb) foundGlb = full;
            }
          }
        };
        findModel(extractDir);

        if (foundObj) {
          console.log(`[processGlb] Converting extracted OBJ to GLB: ${foundObj}`);
          const obj2gltf = require('obj2gltf');
          const tempGlbBuffer = await obj2gltf(foundObj, { binary: true });
          sourceGlbPath = path.join(tempDir, 'converted.glb');
          fs.writeFileSync(sourceGlbPath, tempGlbBuffer);
        } else if (foundGlb) {
          sourceGlbPath = foundGlb;
        } else {
          throw new Error('No .obj or .glb found inside uploaded ZIP archive');
        }
      } else if (downloadedName.toLowerCase().endsWith('.obj')) {
        console.log(`[processGlb] Converting OBJ to GLB: ${downloadedPath}`);
        const obj2gltf = require('obj2gltf');
        const tempGlbBuffer = await obj2gltf(downloadedPath, { binary: true });
        sourceGlbPath = path.join(tempDir, 'converted.glb');
        fs.writeFileSync(sourceGlbPath, tempGlbBuffer);
      } else {
        sourceGlbPath = downloadedPath;
      }

      // 2. Mesh Optimization & Draco Compression via @gltf-transform
      console.log(`[processGlb] Optimizing & Draco compressing: ${sourceGlbPath}`);
      const { NodeIO } = require('@gltf-transform/core');
      const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
      const { weld, dedup, prune, textureCompress, draco } = require('@gltf-transform/functions');
      const draco3d = require('draco3dgltf');
      const sharp = require('sharp');

      const encoder = await draco3d.createEncoderModule();
      const decoder = await draco3d.createDecoderModule();

      const io = new NodeIO()
        .registerExtensions(KHRONOS_EXTENSIONS)
        .registerDependencies({
          'draco3d.encoder': encoder,
          'draco3d.decoder': decoder,
        });

      const document = await io.read(sourceGlbPath);

      // Apply dedup, prune, weld, texture downsampling, and Draco compression
      await document.transform(
        dedup(),
        prune(),
        weld({ tolerance: 0.0001 }),
        textureCompress({ encoder: sharp, resize: [1024, 1024] }),
        draco({ method: 'edgebreaker' }),
      );

      const finalGlbPath = path.join(tempDir, 'model.glb');
      await io.write(finalGlbPath, document);

      const optimizedSize = fs.statSync(finalGlbPath).size;
      console.log(`[processGlb] Optimization complete! Final Draco GLB size: ${(optimizedSize / 1024 / 1024).toFixed(2)} MB`);

      // 3. Upload final model.glb to MinIO
      const s3Dest = `inspections/${id}/model.glb`;
      await this.storageService.uploadFile(bucket, s3Dest, finalGlbPath, 'model/gltf-binary');

      // 4. Update inspection database record
      await this.prisma.inspection.update({
        where: { id },
        data: { glbModelUrl: s3Dest },
      });

      return {
        status: 'SUCCESS',
        glbModelUrl: s3Dest,
        fileSizeMb: parseFloat((optimizedSize / 1024 / 1024).toFixed(2)),
      };
    } catch (err) {
      console.error(`[processGlb] Error processing 3D model:`, err);
      throw new InternalServerErrorException(`Failed to process 3D model: ${err.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async processPanoramas(id: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can process panoramas for this inspection');
    }

    const bucket = 'virtual-inspections';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panos-'));
    const zipPath = path.join(tempDir, 'panoramas.zip');

    try {
      console.log(`[processPanoramas] Downloading panoramas.zip for inspection ${id}...`);
      await this.storageService.downloadFile(bucket, `inspections/${id}/panoramas.zip`, zipPath);

      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      const extractDir = path.join(tempDir, 'extracted');
      fs.mkdirSync(extractDir, { recursive: true });
      zip.extractAllTo(extractDir, true);

      // ─── Execute Automated KTX2 & LOD Generation Pipeline ───
      const scriptPath = path.resolve(process.cwd(), 'scripts/process_panoramas.py');
      const wasmtimePath = path.resolve(process.cwd(), 'bin/wasmtime.exe');
      const basisuWasmPath = path.resolve(process.cwd(), 'bin/basisu_st.wasm');

      if (fs.existsSync(scriptPath)) {
        console.log(`[processPanoramas] Executing KTX2 & LOD generator: ${scriptPath}`);
        const { spawnSync } = require('child_process');
        const res = spawnSync('python', [
          scriptPath,
          '--input_dir', extractDir,
          '--output_dir', extractDir,
          '--wasmtime_bin', wasmtimePath,
          '--basisu_wasm', basisuWasmPath,
          '--sizes', '256', '512', '1024', '2048',
        ], { stdio: 'inherit' });

        if (res.error) {
          console.warn(`[processPanoramas] Python runner warning:`, res.error);
        }
      } else {
        console.warn(`[processPanoramas] Script not found at ${scriptPath}, skipping KTX2 generation.`);
      }

      let uploadedCount = 0;
      const uploadRecursive = async (currDir: string, relPath: string = '') => {
        const entries = fs.readdirSync(currDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currDir, entry.name);
          const s3Rel = relPath ? `${relPath}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await uploadRecursive(fullPath, s3Rel);
          } else {
            let contentType = 'image/jpeg';
            const lower = entry.name.toLowerCase();
            if (lower.endsWith('.png')) contentType = 'image/png';
            else if (lower.endsWith('.json')) contentType = 'application/json';
            else if (lower.endsWith('.ktx2')) contentType = 'image/ktx2';

            const s3Dest = `inspections/${id}/${s3Rel.replace(/\\/g, '/')}`;
            await this.storageService.uploadFile(bucket, s3Dest, fullPath, contentType);
            uploadedCount++;

            if (entry.name === 'scans.json' && !inspection.scansJsonUrl) {
              await this.prisma.inspection.update({
                where: { id },
                data: { scansJsonUrl: s3Dest },
              });
            }
          }
        }
      };

      await uploadRecursive(extractDir);
      console.log(`[processPanoramas] Unpacked & generated ${uploadedCount} panorama files to inspections/${id}/`);
      return { status: 'SUCCESS', filesCount: uploadedCount };
    } catch (err) {
      console.error(`[processPanoramas] Error:`, err);
      throw new InternalServerErrorException(`Failed to unpack & generate panoramas: ${err.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}




