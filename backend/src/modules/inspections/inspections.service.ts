import { Injectable, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import * as THREE from 'three';
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

      // Compute datum and ground offset from root tileset JSON
      let datum: any = null;
      try {
        const rootJsonFullPath = path.join(rootJsonDir, rootJsonName);
        if (fs.existsSync(rootJsonFullPath)) {
          const raw = fs.readFileSync(rootJsonFullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          datum = await this.computeTilesetDatum(parsed, 'rotX_neg90', rootJsonDir);
          if (datum) {
            console.log(`[processTileset] Option A Active: groundOffset=${datum.groundOffset}m ASL (source: ${datum.elevationSource || 'LOCAL'}), meshSnapOffset=${datum.meshSnapOffset}m, lowestPoint=${datum.lowestPoint ? `(${datum.lowestPoint.x}, ${datum.lowestPoint.y}, ${datum.lowestPoint.z})` : 'pending client mesh'}`);
          }
        }
      } catch (datumErr: any) {
        console.warn(`[processTileset] Could not compute datum from tileset JSON:`, datumErr.message);
      }

      // 5. Update inspection record with the tileset URL and pre-calculated ground datum
      const relativeTilesetUrl = `inspections/${id}/tileset/${rootJsonName}`;
      const existingMeta = (inspection.orthoBounds as any) || {};
      const updatedBounds = {
        ...existingMeta,
        ...(datum ? {
          groundOffset: datum.groundOffset,
          groundAsl: datum.groundAsl,
          meshSnapOffset: datum.meshSnapOffset,
          lowestPoint: datum.lowestPoint,
          elevationRange: datum.elevationRange,
          minYRaw: datum.minYRaw,
          maxYRaw: datum.maxYRaw,
          elevationSource: datum.elevationSource,
        } : {}),
      };

      await this.prisma.inspection.update({
        where: { id },
        data: {
          tilesetUrl: relativeTilesetUrl,
          orthoBounds: updatedBounds,
          ...(datum?.gps ? {
            latitude: datum.gps.lat,
            longitude: datum.gps.lon,
          } : {}),
          ...(datum?.groundAsl ? {
            altitude: datum.groundAsl,
          } : {}),
          ...(datum ? {
            dsmMinElevation: datum.elevationRange.min,
            dsmMaxElevation: datum.elevationRange.max,
          } : {}),
        },
      });

      console.log(`[processTileset] 3D Tileset unpacked successfully. tilesetUrl = ${relativeTilesetUrl}`);
      return { status: 'SUCCESS', tilesetUrl: relativeTilesetUrl, datum };
    } catch (err) {
      console.error(`[processTileset] Error:`, err);
      throw new InternalServerErrorException(`Failed to unpack 3D Tileset: ${err.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  extractLowestVertexFromB3DM(b3dmBuf: Buffer, orientation: string = 'rotX_neg90'): { minY: number; minVert: { x: number; y: number; z: number } } | null {
    try {
      const featureTableJSONByteLength = b3dmBuf.readUInt32LE(12);
      const featureTableBinaryByteLength = b3dmBuf.readUInt32LE(16);
      const batchTableJSONByteLength = b3dmBuf.readUInt32LE(20);
      const batchTableBinaryByteLength = b3dmBuf.readUInt32LE(24);
      const glbOffset = 28 + featureTableJSONByteLength + featureTableBinaryByteLength + batchTableJSONByteLength + batchTableBinaryByteLength;

      const glbBuf = b3dmBuf.subarray(glbOffset);
      const chunk0Len = glbBuf.readUInt32LE(12);
      const jsonStr = glbBuf.toString('utf-8', 20, 20 + chunk0Len);
      const gltf = JSON.parse(jsonStr);

      const chunk1Offset = 20 + chunk0Len;
      const chunk1Len = glbBuf.readUInt32LE(chunk1Offset);
      const binBuf = glbBuf.subarray(chunk1Offset + 8, chunk1Offset + 8 + chunk1Len);

      const posAccessor = gltf.accessors?.find((a: any) => a.type === 'VEC3') || gltf.accessors?.[0];
      if (!posAccessor) return null;

      const bufferView = gltf.bufferViews[posAccessor.bufferView];
      const byteOffset = (bufferView.byteOffset || 0) + (posAccessor.byteOffset || 0);
      const count = posAccessor.count;
      const f32 = new Float32Array(binBuf.buffer, binBuf.byteOffset + byteOffset, count * 3);

      const upRot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      let rotMat = new THREE.Matrix4().identity();
      if (orientation === 'rotX_neg90') rotMat.makeRotationX(-Math.PI / 2);
      else if (orientation === 'rotX_90') rotMat.makeRotationX(Math.PI / 2);
      const totalMat = new THREE.Matrix4().multiplyMatrices(rotMat, upRot);

      let minY = Infinity;
      let minVert: THREE.Vector3 | null = null;
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3(f32[i * 3], f32[i * 3 + 1], f32[i * 3 + 2]);
        v.applyMatrix4(totalMat);
        if (v.y < minY) {
          minY = v.y;
          minVert = v.clone();
        }
      }

      if (!minVert || !isFinite(minY)) return null;

      return {
        minY,
        minVert: {
          x: Number(minVert.x.toFixed(3)),
          y: 0.0,
          z: Number(minVert.z.toFixed(3))
        }
      };
    } catch (e) {
      return null;
    }
  }

  async computeTilesetDatum(json: any, orientation: string = 'rotX_neg90', rootJsonDir?: string) {
    if (!json || !json.root) return null;
    const root = json.root;
    const rawTransform = root.transform || [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];

    // 1. Extract GPS from root transform (ECEF) or root boundingVolume.region
    let gps: { lat: number; lon: number } | null = null;
    if (rawTransform && rawTransform.length === 16) {
      const x = rawTransform[12];
      const y = rawTransform[13];
      const z = rawTransform[14];
      const mag = Math.hypot(x, y, z);
      if (mag > 6000000 && mag < 6500000) {
        const a = 6378137.0;
        const b = 6356752.314245;
        const e2 = 1 - (b * b) / (a * a);
        const ep2 = (a * a) / (b * b) - 1;
        const p = Math.hypot(x, y);
        const theta = Math.atan2(z * a, p * b);
        const lon = (Math.atan2(y, x) * 180) / Math.PI;
        const lat = (Math.atan2(
          z + ep2 * b * Math.pow(Math.sin(theta), 3),
          p - e2 * a * Math.pow(Math.cos(theta), 3)
        ) * 180) / Math.PI;
        gps = { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
      }
    }
    if (!gps && root.boundingVolume?.region && Array.isArray(root.boundingVolume.region)) {
      const [west, south, east, north] = root.boundingVolume.region;
      gps = {
        lat: Number((((south + north) * 0.5 * 180) / Math.PI).toFixed(6)),
        lon: Number((((west + east) * 0.5 * 180) / Math.PI).toFixed(6)),
      };
    }

    // 2. Query satellite DEM elevation from Copernicus DEM via Open-Meteo (Option A)
    let groundAsl: number | null = null;
    if (gps) {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${gps.lat}&longitude=${gps.lon}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const demData: any = await res.json();
          if (Array.isArray(demData?.elevation) && typeof demData.elevation[0] === 'number') {
            groundAsl = Number(demData.elevation[0].toFixed(2));
            console.log(`[computeTilesetDatum] Option A Active: Auto-detected Copernicus DEM Elevation at (${gps.lat}°, ${gps.lon}°): ${groundAsl}m ASL`);
          }
        }
      } catch (demErr: any) {
        console.warn(`[computeTilesetDatum] Satellite DEM elevation lookup notice:`, demErr.message);
      }
    }

    const m4Root = new THREE.Matrix4().fromArray(rawTransform);
    const invRoot = m4Root.clone().invert();
    let rotMat = new THREE.Matrix4().identity();
    if (orientation === 'rotX_neg90') {
      rotMat.makeRotationX(-Math.PI / 2);
    } else if (orientation === 'rotX_90') {
      rotMat.makeRotationX(Math.PI / 2);
    }
    const finalMat = new THREE.Matrix4().multiplyMatrices(rotMat, invRoot);

    const box = root.boundingVolume?.box;
    if (!box || box.length !== 12) return null;

    const center = new THREE.Vector3(box[0], box[1], box[2]);
    const xAxis = new THREE.Vector3(box[3], box[4], box[5]);
    const yAxis = new THREE.Vector3(box[6], box[7], box[8]);
    const zAxis = new THREE.Vector3(box[9], box[10], box[11]);

    let minY = Infinity;
    let maxY = -Infinity;

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const pt = center.clone()
            .addScaledVector(xAxis, sx)
            .addScaledVector(yAxis, sy)
            .addScaledVector(zAxis, sz);
          pt.applyMatrix4(m4Root);
          pt.applyMatrix4(finalMat);

          if (pt.y < minY) {
            minY = pt.y;
          }
          if (pt.y > maxY) {
            maxY = pt.y;
          }
        }
      }
    }

    if (!isFinite(minY)) return null;

    // Check if a real b3dm file is available to extract the true lowest surface vertex
    let trueLowestPoint: { x: number; y: number; z: number } | null = null;
    if (rootJsonDir) {
      try {
        const contentUri = root.content?.uri || root.content?.url;
        let b3dmPath: string | null = null;
        if (contentUri) {
          const candidate = path.join(rootJsonDir, contentUri);
          if (fs.existsSync(candidate)) b3dmPath = candidate;
        }
        if (!b3dmPath) {
          // Find any b3dm in rootJsonDir
          const findB3dm = (dir: string): string | null => {
            const list = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of list) {
              const full = path.join(dir, item.name);
              if (item.isFile() && item.name.endsWith('.b3dm')) return full;
              if (item.isDirectory()) {
                const sub = findB3dm(full);
                if (sub) return sub;
              }
            }
            return null;
          };
          b3dmPath = findB3dm(rootJsonDir);
        }

        if (b3dmPath && fs.existsSync(b3dmPath)) {
          const b3dmBuf = fs.readFileSync(b3dmPath);
          const vertexRes = this.extractLowestVertexFromB3DM(b3dmBuf, orientation);
          if (vertexRes && vertexRes.minVert) {
            trueLowestPoint = vertexRes.minVert;
            console.log(`[processTileset] Found true mesh lowest surface vertex: (${trueLowestPoint.x}, 0.0, ${trueLowestPoint.z})`);
          }
        }
      } catch (err: any) {
        console.warn(`[processTileset] B3DM vertex scan notice:`, err.message);
      }
    }

    const meshSnapOffset = -minY;
    const finalGroundAsl = groundAsl ?? Number(meshSnapOffset.toFixed(3));
    return {
      groundOffset: finalGroundAsl,
      groundAsl: finalGroundAsl,
      meshSnapOffset: Number(meshSnapOffset.toFixed(3)),
      minYRaw: Number(minY.toFixed(3)),
      maxYRaw: Number(maxY.toFixed(3)),
      lowestPoint: trueLowestPoint,
      elevationRange: {
        min: 0.0,
        max: Number((maxY - minY).toFixed(3)),
      },
      gps,
      elevationSource: groundAsl ? 'COPERNICUS_DEM_30M' : 'LOCAL_BBOX',
    };
  }

  private checkGlbHasKtx2(filePath: string): boolean {
    try {
      const fd = fs.openSync(filePath, 'r');
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      const magic = header.readUInt32LE(0);
      if (magic !== 0x46546c67) {
        fs.closeSync(fd);
        return false;
      }
      const chunkHeader = Buffer.alloc(8);
      fs.readSync(fd, chunkHeader, 0, 8, 12);
      const jsonLength = chunkHeader.readUInt32LE(0);
      const readLen = Math.min(jsonLength, 65536);
      const jsonBuffer = Buffer.alloc(readLen);
      fs.readSync(fd, jsonBuffer, 0, readLen, 20);
      fs.closeSync(fd);
      return jsonBuffer.toString('utf8').includes('KHR_texture_basisu');
    } catch (_) {
      return false;
    }
  }

  private getGlbVertexCount(filePath: string): number {
    try {
      const fd = fs.openSync(filePath, 'r');
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      if (header.readUInt32LE(0) !== 0x46546c67) {
        fs.closeSync(fd);
        return 500000;
      }
      const chunkHeader = Buffer.alloc(8);
      fs.readSync(fd, chunkHeader, 0, 8, 12);
      const jsonLength = chunkHeader.readUInt32LE(0);
      const readLen = Math.min(jsonLength, 65536);
      const jsonBuffer = Buffer.alloc(readLen);
      fs.readSync(fd, jsonBuffer, 0, readLen, 20);
      fs.closeSync(fd);
      const jsonStr = jsonBuffer.toString('utf8');
      const gltf = JSON.parse(jsonStr);
      let total = 0;
      if (gltf.meshes) {
        for (const m of gltf.meshes) {
          for (const p of m.primitives || []) {
            if (p.attributes && p.attributes.POSITION !== undefined && gltf.accessors) {
              total += gltf.accessors[p.attributes.POSITION]?.count || 0;
            }
          }
        }
      }
      return total > 0 ? total : 500000;
    } catch (_) {
      return 500000;
    }
  }

  private getGlbTextureCount(filePath: string): number {
    try {
      const fd = fs.openSync(filePath, 'r');
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      if (header.readUInt32LE(0) !== 0x46546c67) {
        fs.closeSync(fd);
        return 1;
      }
      const chunkHeader = Buffer.alloc(8);
      fs.readSync(fd, chunkHeader, 0, 8, 12);
      const jsonLength = chunkHeader.readUInt32LE(0);
      const readLen = Math.min(jsonLength, 65536);
      const jsonBuffer = Buffer.alloc(readLen);
      fs.readSync(fd, jsonBuffer, 0, readLen, 20);
      fs.closeSync(fd);
      const jsonStr = jsonBuffer.toString('utf8');
      const texturesMatch = jsonStr.match(/"textures"\s*:\s*\[([^\]]*)\]/);
      if (texturesMatch) {
        const count = (texturesMatch[1].match(/\{/g) || []).length;
        return count > 0 ? count : 1;
      }
      const imagesMatch = jsonStr.match(/"images"\s*:\s*\[([^\]]*)\]/);
      if (imagesMatch) {
        const count = (imagesMatch[1].match(/\{/g) || []).length;
        return count > 0 ? count : 1;
      }
      return 1;
    } catch (_) {
      return 1;
    }
  }

  async processGlb(
    id: string, 
    userEnterpriseId: string, 
    role: Role, 
    targetFileName?: string,
    compressionMode: 'uastc' | 'etc1s' = 'uastc',
    onProgress?: (progress: number, stage: string) => Promise<void>
  ) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can process 3D models for this inspection');
    }

    const bucket = 'virtual-inspections';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-opt-'));

    try {
      // 1. Locate and download source file
      let downloadedName = targetFileName;
      if (!downloadedName) {
        if (inspection.glbModelUrl) {
          downloadedName = path.basename(inspection.glbModelUrl);
        } else {
          downloadedName = 'model.glb';
        }
      }

      const downloadedPath = path.join(tempDir, downloadedName);
      const s3Source = `inspections/${id}/${downloadedName}`;
      if (onProgress) await onProgress(15, `Downloading source model ${downloadedName}...`);
      await this.storageService.downloadFile(bucket, s3Source, downloadedPath);

      let sourceGlbPath: string;

      // Unpack ZIP or convert OBJ to GLB if needed
      if (downloadedName.toLowerCase().endsWith('.zip')) {
        console.log(`[processGlb] Extracting ZIP model archive: ${downloadedPath}`);
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(downloadedPath);
        const extractDir = path.join(tempDir, 'unzipped');
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

      if (onProgress) await onProgress(35, 'Analyzing 3D geometry density and texture maps...');

      // 2. Mesh Optimization & KTX2 Texture Compression via gltfpack (with @gltf-transform fallback)
      const finalGlbPath = path.join(tempDir, 'model.glb');
      const isAlreadyKtx2 = this.checkGlbHasKtx2(sourceGlbPath);
      const vertexCount = this.getGlbVertexCount(sourceGlbPath);
      const textureCount = this.getGlbTextureCount(sourceGlbPath);
      
      // Adaptive Polygon Density Ceiling:
      // Real-time WebGL engines should not load raw 10M+ unsimplified photogrammetry meshes synchronously.
      // - Master Model Target: Max ~1.5M vertices (~3M triangles) for desktop 60 FPS
      // - Mobile Model Target: Max ~400K vertices (~800K triangles) for mobile 60 FPS
      const maxMasterVertices = 1500000;
      const maxMobileVertices = 400000;
      let masterSimplificationRatio = 1.0;
      if (vertexCount > maxMasterVertices) {
        masterSimplificationRatio = Math.max(0.1, Number((maxMasterVertices / vertexCount).toFixed(2)));
      }
      let mobileSimplificationRatio = Math.min(0.35, Number((maxMobileVertices / vertexCount).toFixed(2)));
      if (mobileSimplificationRatio < 0.05) mobileSimplificationRatio = 0.05;

      // Adaptive Texture Resolution:
      // Single texture atlas: 2048px (4.5 MB KTX2, instant 0.2s transcode, crystal sharp)
      // Multi-patch fragmented: 1024px
      const masterTexLimit = textureCount <= 2 ? '2048' : '1024';
      const mobileTexLimit = textureCount <= 2 ? '1024' : '512';

      console.log(`[processGlb] source: ${sourceGlbPath}, isAlreadyKtx2: ${isAlreadyKtx2}, vertices: ${vertexCount}, textures: ${textureCount}, decimation: [master: ${masterSimplificationRatio}, mobile: ${mobileSimplificationRatio}], texLimits: [master: ${masterTexLimit}px, mobile: ${mobileTexLimit}px]`);

      let gltfpackBin = 'gltfpack';
      if (process.platform === 'win32') {
        const localWin = path.resolve(process.cwd(), 'gltfpack.exe');
        if (fs.existsSync(localWin)) gltfpackBin = localWin;
      } else {
        if (fs.existsSync('/usr/local/bin/gltfpack')) gltfpackBin = '/usr/local/bin/gltfpack';
      }
      let usedGltfpack = false;

      if (onProgress) await onProgress(50, 'Encoding Basis Universal KTX2 textures and Draco geometry...');

      const hasGltfpack = fs.existsSync(gltfpackBin) || gltfpackBin === 'gltfpack';
      if (hasGltfpack) {
        try {
          const { execFile } = require('child_process');
          const util = require('util');
          const execFilePromise = util.promisify(execFile);

          const args = ['-i', sourceGlbPath, '-o', finalGlbPath, '-cc', '-mm'];
          if (masterSimplificationRatio < 1.0) {
            args.push('-si', String(masterSimplificationRatio), '-slb');
          }

          if (!isAlreadyKtx2) {
            args.push('-tc', '-tl', masterTexLimit, '-tq', '6', '-tj', '2');
            console.log(`[processGlb] Compressing textures with KTX2 BasisU (max ${masterTexLimit}px, q=6, threads=2) + Mesh Merging...`);
          } else {
            console.log(`[processGlb] Model already has KTX2 textures. Preserving textures, merging meshes and optimizing geometry.`);
          }

          const { stdout, stderr } = await execFilePromise(gltfpackBin, args, { maxBuffer: 100 * 1024 * 1024 });
          if (stdout) console.log(`[gltfpack] ${stdout}`);
          if (stderr) console.warn(`[gltfpack warn] ${stderr}`);

          if (fs.existsSync(finalGlbPath) && fs.statSync(finalGlbPath).size > 0) {
            usedGltfpack = true;
          }

          // Generate Mobile LOD1 Model (decimated geometry with locked borders for locked 60 FPS mobile performance)
          const lod1GlbPath = path.join(tempDir, 'model_lod1.glb');
          const lod1Args = ['-i', sourceGlbPath, '-o', lod1GlbPath, '-si', String(mobileSimplificationRatio), '-slb', '-cc', '-mm'];
          if (!isAlreadyKtx2) {
            lod1Args.push('-tc', '-tl', mobileTexLimit, '-tq', '5', '-tj', '2');
          }
          try {
            if (onProgress) await onProgress(75, 'Generating 35% decimated mobile LOD1 mesh...');
            console.log(`[processGlb] Generating automated Mobile LOD1 decimated mesh (-si ${mobileSimplificationRatio} -slb, max ${mobileTexLimit}px)...`);
            const { stdout: lod1Out } = await execFilePromise(gltfpackBin, lod1Args, { maxBuffer: 100 * 1024 * 1024 });
            if (lod1Out) console.log(`[gltfpack LOD1] ${lod1Out}`);
          } catch (lodErr: any) {
            console.warn(`[processGlb] Warning: Failed to generate model_lod1.glb:`, lodErr.message);
          }
        } catch (gpErr) {
          console.warn(`[processGlb] gltfpack failed, falling back to @gltf-transform:`, gpErr.message);
        }
      }

      if (!usedGltfpack) {
        console.log(`[processGlb] Optimizing & Draco compressing via @gltf-transform: ${sourceGlbPath}`);
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
        await document.transform(
          dedup(),
          prune(),
          weld({ tolerance: 0.0001 }),
          textureCompress({ encoder: sharp, resize: [1024, 1024] }),
          draco({ method: 'edgebreaker' }),
        );
        await io.write(finalGlbPath, document);
      }

      const optimizedSize = fs.statSync(finalGlbPath).size;
      console.log(`[processGlb] Optimization complete! Final model size: ${(optimizedSize / 1024 / 1024).toFixed(2)} MB`);

      // 3. Upload final model.glb to MinIO
      if (onProgress) await onProgress(90, 'Uploading optimized 3D Digital Twin models to storage...');
      const s3Dest = `inspections/${id}/model.glb`;
      await this.storageService.uploadFile(bucket, s3Dest, finalGlbPath, 'model/gltf-binary');

      // Upload mobile model_lod1.glb if generated
      const lod1GlbPath = path.join(tempDir, 'model_lod1.glb');
      if (fs.existsSync(lod1GlbPath) && fs.statSync(lod1GlbPath).size > 0) {
        const lod1S3Dest = `inspections/${id}/model_lod1.glb`;
        await this.storageService.uploadFile(bucket, lod1S3Dest, lod1GlbPath, 'model/gltf-binary');
        console.log(`[processGlb] Uploaded mobile model_lod1.glb (${(fs.statSync(lod1GlbPath).size / 1024 / 1024).toFixed(2)} MB) to ${lod1S3Dest}`);
      }

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

  async processPanoramas(
    id: string, 
    userEnterpriseId: string, 
    role: Role,
    onProgress?: (progress: number, stage: string) => Promise<void>
  ) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can process panoramas for this inspection');
    }

    const bucket = 'virtual-inspections';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panos-'));
    const zipPath = path.join(tempDir, 'panoramas.zip');

    try {
      await this.storageService.downloadFile(bucket, `inspections/${id}/panoramas.zip`, zipPath);

      const AdmZip = require('adm-zip');
      const sharp = require('sharp');
      const execPromise = promisify(exec);
      const zip = new AdmZip(zipPath);
      const extractDir = path.join(tempDir, 'extracted');
      zip.extractAllTo(extractDir, true);

      if (onProgress) await onProgress(10, 'Unpacking scan archives and discovering stations...');

      // Create structured output folders
      const outputDir = path.join(tempDir, 'output');
      const cubemapsDir = path.join(outputDir, 'cubemaps');
      const equirectDir = path.join(outputDir, 'equirect');
      const equirectLowDir = path.join(outputDir, 'equirect_low');
      const ktx2Dir = path.join(outputDir, 'ktx2');

      fs.mkdirSync(cubemapsDir, { recursive: true });
      fs.mkdirSync(equirectDir, { recursive: true });
      fs.mkdirSync(equirectLowDir, { recursive: true });
      fs.mkdirSync(ktx2Dir, { recursive: true });

      // Locate all files in the extracted archive
      const allExtractedFiles: { name: string; fullPath: string }[] = [];
      const findFilesRecursive = (curr: string) => {
        const entries = fs.readdirSync(curr, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(curr, entry.name);
          if (entry.isDirectory()) {
            findFilesRecursive(full);
          } else {
            allExtractedFiles.push({ name: entry.name, fullPath: full });
          }
        }
      };
      findFilesRecursive(extractDir);

      // 1. Check for scans.json / scan_metadata.json
      let scansJsonPath: string | null = null;
      let rawScansData: any = null;
      for (const f of allExtractedFiles) {
        if (f.name.toLowerCase() === 'scans.json') {
          scansJsonPath = f.fullPath;
          try {
            rawScansData = JSON.parse(fs.readFileSync(f.fullPath, 'utf8'));
          } catch (e) {
            console.warn('[processPanoramas] Error parsing scans.json:', e);
          }
          break;
        }
      }

      // If not inside the zip, check if scans.json was uploaded directly to the inspection bucket
      if (!rawScansData) {
        try {
          const rootScansPath = path.join(tempDir, 'root_scans.json');
          await this.storageService.downloadFile(bucket, `inspections/${id}/scans.json`, rootScansPath);
          if (fs.existsSync(rootScansPath)) {
            rawScansData = JSON.parse(fs.readFileSync(rootScansPath, 'utf8'));
            console.log(`[processPanoramas] Loaded root scans.json from inspection storage (${rawScansData.length || Object.keys(rawScansData).length} stations)`);
          }
        } catch (e: any) {
          // Root scans.json not present
        }
      }

      // Group cubemap faces and equirectangular images by scan identifier
      const scanCubemaps = new Map<string, { [face: string]: string }>();
      const scanEquirects = new Map<string, string>();
      const scanEquirectLows = new Map<string, string>();

      const faceRegex = /^(?:scan_)?(\d+|[a-zA-Z0-9_-]+)_(px|nx|py|ny|pz|nz)\.(jpe?g|png)$/i;
      const equirectLowRegex = /^(?:scan_)?(\d+|[a-zA-Z0-9_-]+)_equirect_low\.(jpe?g|png)$/i;
      const equirectRegex = /^(?:scan_)?(\d+|[a-zA-Z0-9_-]+)_(?:equirect|pano)\.(jpe?g|png)$/i;

      for (const f of allExtractedFiles) {
        const eqLowMatch = f.name.match(equirectLowRegex);
        if (eqLowMatch) {
          const scanId = eqLowMatch[1];
          scanEquirectLows.set(scanId, f.fullPath);
          continue;
        }

        const eqMatch = f.name.match(equirectRegex);
        if (eqMatch) {
          const scanId = eqMatch[1];
          scanEquirects.set(scanId, f.fullPath);
          continue;
        }

        const faceMatch = f.name.match(faceRegex);
        if (faceMatch) {
          const scanId = faceMatch[1];
          const face = faceMatch[2].toLowerCase();
          if (!scanCubemaps.has(scanId)) {
            scanCubemaps.set(scanId, {});
          }
          scanCubemaps.get(scanId)![face] = f.fullPath;
        }
      }

      // Collect all scan IDs to process
      const scanIds = new Set<string>([
        ...scanCubemaps.keys(),
        ...scanEquirects.keys(),
        ...scanEquirectLows.keys(),
      ]);

      if (rawScansData) {
        const arr = Array.isArray(rawScansData) ? rawScansData : Object.keys(rawScansData).map(k => ({ '#name': k }));
        arr.forEach((s: any, idx: number) => {
          const name = s['#name'] || s.id || `scan_${idx}`;
          const clean = String(name).replace(/^scan_/, '');
          scanIds.add(clean);
        });
      }

      console.log(`[processPanoramas] Found ${scanIds.size} scan stations to process.`);

      let wasmtimeBin = 'wasmtime';
      if (process.platform === 'win32') {
        const localWin = path.resolve(process.cwd(), 'bin/wasmtime.exe');
        if (fs.existsSync(localWin)) wasmtimeBin = localWin;
      } else {
        if (fs.existsSync('/usr/local/bin/wasmtime')) wasmtimeBin = '/usr/local/bin/wasmtime';
      }
      const wasmModule = path.resolve(process.cwd(), 'bin/basisu_st.wasm');
      const hasWasmEncoder = (fs.existsSync(wasmtimeBin) || wasmtimeBin === 'wasmtime') && fs.existsSync(wasmModule);

      const metadataOut: Record<string, any> = {};

      let scanIdx = 0;
      for (const scanId of scanIds) {
        scanIdx++;
        const cleanId = String(scanId).replace(/^scan_/, '');
        const fullScanKey = `scan_${cleanId}`;
        const scanPct = Math.min(88, 10 + Math.floor((scanIdx / Math.max(1, scanIds.size)) * 75));
        if (onProgress) {
          await onProgress(scanPct, `Generating multi-LOD cubemaps & KTX2 for station ${scanIdx}/${scanIds.size} (${fullScanKey})...`);
        }
        console.log(`[processPanoramas] Processing ${fullScanKey}...`);

        // A. Process Equirectangular Images
        const origEquirect = scanEquirects.get(cleanId) || scanEquirects.get(fullScanKey);
        const origEquirectLow = scanEquirectLows.get(cleanId) || scanEquirectLows.get(fullScanKey);
        const destEquirectLow = path.join(equirectLowDir, `${fullScanKey}_equirect_low.jpg`);
        const destEquirect = path.join(equirectDir, `${fullScanKey}_equirect.jpg`);

        if (origEquirect) {
          fs.copyFileSync(origEquirect, destEquirect);
          // Always generate crisp 2048x1024 transition equirect using sharp MozJPEG from master equirect
          try {
            await sharp(origEquirect)
              .resize(2048, 1024, { fit: 'fill' })
              .jpeg({ quality: 85, mozjpeg: true })
              .toFile(destEquirectLow);
            console.log(`  [MozJPEG] Generated crisp 2048x1024 ${destEquirectLow}`);
          } catch (e: any) {
            console.warn(`  [processPanoramas] Error generating equirect_low for ${fullScanKey}:`, e.message);
          }
        } else if (origEquirectLow) {
          fs.copyFileSync(origEquirectLow, destEquirectLow);
        }

        // B. Process Cubemaps & Multi-Resolution KTX2 LODs
        const faces = scanCubemaps.get(cleanId) || scanCubemaps.get(fullScanKey);
        const requiredFaces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
        const hasAllFaces = faces && requiredFaces.every(f => !!faces[f]);

        if (hasAllFaces) {
          // Copy native cubemap faces to output/cubemaps
          for (const f of requiredFaces) {
            const destFace = path.join(cubemapsDir, `${fullScanKey}_${f}.jpg`);
            fs.copyFileSync(faces[f], destFace);
          }

          // Generate UASTC Mipmapped KTX2 Cubemaps (256, 512, 1024)
          if (hasWasmEncoder) {
            const sizes = [256, 512, 1024];
            for (const size of sizes) {
              const ktx2RelOut = `output/ktx2/${fullScanKey}_${size}.ktx2`;
              const faceRelPaths = requiredFaces.map(f => `output/cubemaps/${fullScanKey}_${f}.jpg`);
              
              const cmd = `"${wasmtimeBin}" run --dir . "${wasmModule}" -cubemap -uastc -uastc_level 2 -mipmap -resample ${size} ${size} -output_file ${ktx2RelOut} ${faceRelPaths.join(' ')}`;
              try {
                await execPromise(cmd, { cwd: tempDir });
                console.log(`  [KTX2] Generated ${fullScanKey}_${size}.ktx2`);
              } catch (ktxErr: any) {
                console.warn(`  [KTX2] Failed generating ${fullScanKey}_${size}.ktx2:`, ktxErr.message);
              }
            }
          }
        }

        // C. Construct Scan Metadata
        let position = [0, 0, 0];
        let quaternion_xyzw = [0, 0, 0, 1];
        let quaternion_wxyz = [1, 0, 0, 0];

        if (rawScansData) {
          let matchedScan: any = null;
          if (Array.isArray(rawScansData)) {
            matchedScan = rawScansData.find((s: any) => s['#name'] === fullScanKey || s['#name'] === cleanId || s.id === fullScanKey || s.id === cleanId);
          } else if (rawScansData[fullScanKey] || rawScansData[cleanId]) {
            matchedScan = rawScansData[fullScanKey] || rawScansData[cleanId];
          }

          if (matchedScan) {
            const posX = matchedScan.x ?? matchedScan.posX ?? matchedScan.position?.[0] ?? 0;
            const posY = matchedScan.y ?? matchedScan.posY ?? matchedScan.position?.[1] ?? 0;
            const posZ = matchedScan.alt ?? matchedScan.z ?? matchedScan.posZ ?? matchedScan.position?.[2] ?? 0;
            position = [posX, posY, posZ];

            if (matchedScan.quaternion_xyzw) {
              quaternion_xyzw = matchedScan.quaternion_xyzw;
              quaternion_wxyz = [matchedScan.quaternion_xyzw[3], matchedScan.quaternion_xyzw[0], matchedScan.quaternion_xyzw[1], matchedScan.quaternion_xyzw[2]];
            } else if (matchedScan.rotation_quaternion) {
              const rq = matchedScan.rotation_quaternion;
              quaternion_wxyz = rq;
              quaternion_xyzw = [rq[1], rq[2], rq[3], rq[0]];
            }
          }
        }

        metadataOut[fullScanKey] = {
          index: parseInt(cleanId, 10) || 0,
          position,
          quaternion_xyzw,
          quaternion_wxyz,
          cubemap_urls: [
            `cubemaps/${fullScanKey}_px.jpg`,
            `cubemaps/${fullScanKey}_nx.jpg`,
            `cubemaps/${fullScanKey}_py.jpg`,
            `cubemaps/${fullScanKey}_ny.jpg`,
            `cubemaps/${fullScanKey}_pz.jpg`,
            `cubemaps/${fullScanKey}_nz.jpg`,
          ],
          equirect_url: `equirect/${fullScanKey}_equirect.jpg`,
          equirect_low_url: `equirect_low/${fullScanKey}_equirect_low.jpg`,
          ktx2_256: fs.existsSync(path.join(outputDir, `output/ktx2/${fullScanKey}_256.ktx2`)) || fs.existsSync(path.join(ktx2Dir, `${fullScanKey}_256.ktx2`)) ? `ktx2/${fullScanKey}_256.ktx2` : null,
          ktx2_512: fs.existsSync(path.join(outputDir, `output/ktx2/${fullScanKey}_512.ktx2`)) || fs.existsSync(path.join(ktx2Dir, `${fullScanKey}_512.ktx2`)) ? `ktx2/${fullScanKey}_512.ktx2` : null,
          ktx2_1024: fs.existsSync(path.join(outputDir, `output/ktx2/${fullScanKey}_1024.ktx2`)) || fs.existsSync(path.join(ktx2Dir, `${fullScanKey}_1024.ktx2`)) ? `ktx2/${fullScanKey}_1024.ktx2` : null,
        };
      }

      // Write scan_metadata.json & scans.json to output
      fs.writeFileSync(path.join(outputDir, 'scan_metadata.json'), JSON.stringify(metadataOut, null, 2), 'utf8');
      if (scansJsonPath) {
        fs.copyFileSync(scansJsonPath, path.join(outputDir, 'scans.json'));
      }

      // Upload everything from outputDir to MinIO
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

            const s3Dest = `inspections/${id}/${s3Rel}`;
            await this.storageService.uploadFile(bucket, s3Dest, fullPath, contentType);
            uploadedCount++;
          }
        }
      };

      if (onProgress) await onProgress(90, 'Uploading multi-LOD textures and metadata to storage...');
      await uploadRecursive(outputDir);
      console.log(`[processPanoramas] Uploaded ${uploadedCount} optimized panorama assets (KTX2, LODs, equirects) to inspections/${id}/`);

      const scansJsonS3 = `inspections/${id}/scans.json`;
      if (!inspection.scansJsonUrl) {
        await this.prisma.inspection.update({
          where: { id },
          data: { scansJsonUrl: scansJsonS3 },
        });
      }

      return { status: 'SUCCESS', filesCount: uploadedCount, scansProcessed: scanIds.size };
    } catch (err: any) {
      console.error(`[processPanoramas] Error:`, err);
      throw new InternalServerErrorException(`Failed to process panoramas: ${err.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async getProcessingStatus(id: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      select: {
        id: true,
        processingStatus: true,
        processingProgress: true,
        processingStage: true,
        processingError: true,
        glbModelUrl: true,
        scansJsonUrl: true,
      },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');
    return inspection;
  }

  async markAsQueued(id: string, stage: string = 'Queued in background asset processing worker...') {
    return this.prisma.inspection.update({
      where: { id },
      data: {
        processingStatus: 'QUEUED',
        processingProgress: 0,
        processingStage: stage,
        processingError: null,
      },
    });
  }
}




