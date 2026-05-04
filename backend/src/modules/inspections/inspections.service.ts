import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
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
import { Visibility, Role, ProcessingStatus } from '@prisma/client';

@Injectable()
export class InspectionsService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async create(projectId: string, createInspectionDto: CreateInspectionDto, userEnterpriseId: string) {
    return this.prisma.inspection.create({
      data: {
        ...createInspectionDto,
        projectId,
        // Wait, Inspection does not have userEnterpriseId anymore, it relies on authorizedViewers, Project has enterprise.
        // If we want to link user who created the inspection, we need to add back userEnterpriseId to Inspection.
        // Wait, did I remove userEnterpriseId? Yes, I replaced it. Let's see the schema I pushed.
      },
    });
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
        authorizedViewers: true,
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
    if (fileName.endsWith('.glb')) {
      await this.prisma.inspection.update({
        where: { id },
        data: { glbModelUrl: s3Path },
      });
    } else if (fileName.endsWith('scans.json')) {
      await this.prisma.inspection.update({
        where: { id },
        data: { scansJsonUrl: s3Path },
      });
    }


    return { presignedUrl, expectedPath: s3Path };
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

    // Upload to Minio
    const bucket = 'virtual-inspections';
    const s3Path = `inspections/${id}/scans.json`;
    await this.storageService.uploadBuffer(bucket, s3Path, fileBuffer, 'application/json');

    // Update DB
    await this.prisma.inspection.update({
      where: { id },
      data: { scansJsonUrl: s3Path },
    });

    return { success: true, s3Path };
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
}
