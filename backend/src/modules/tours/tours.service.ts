import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
import { UpdateTourPermissionsDto } from './dto/update-tour-permissions.dto';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
import { Visibility, Role, ProcessingStatus } from '@prisma/client';

@Injectable()
export class ToursService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async create(createTourDto: CreateTourDto, creatorId: string) {
    return this.prisma.tour.create({
      data: {
        ...createTourDto,
        creatorId,
      },
    });
  }

  async findAll(user?: { id: string; role: Role }) {
    if (!user) {
      // Anonymous user: only PUBLIC tours
      return this.prisma.tour.findMany({
        where: { visibility: Visibility.PUBLIC },
      });
    }

    if (user.role === Role.ADMIN) {
      return this.prisma.tour.findMany(); // Admins see everything
    }

    // Authenticated Viewers/Creators see PUBLIC + what they own + what they are authorized for
    return this.prisma.tour.findMany({
      where: {
        OR: [
          { visibility: Visibility.PUBLIC },
          { creatorId: user.id },
          { authorizedViewers: { some: { id: user.id } } },
        ],
      },
    });
  }

  async findOne(id: string, user?: { id: string; role: Role }) {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      include: {
        scans: true,
        tags: { include: { documents: true } },
        panoramas: true,
        areaPointers: true,
        authorizedViewers: true,
      },
    });

    if (!tour) {
      throw new NotFoundException('Tour not found');
    }

    if (tour.visibility === Visibility.PUBLIC) {
      return tour;
    }

    // Private tour logic requires an authenticated user
    if (!user) {
      throw new ForbiddenException('You must be logged in to access this private tour');
    }

    // Admins and creators always bypass
    if (user.role === Role.ADMIN || tour.creatorId === user.id) {
      return tour;
    }

    // Check if user is in authorizedViewers
    const isAuthorized = tour.authorizedViewers.some((v) => v.id === user.id);
    if (!isAuthorized) {
      throw new ForbiddenException('You are not authorized to view this private tour');
    }

    return tour;
  }

  async getBundle(id: string, user?: { id: string; role: Role }) {
    // getBundle strictly leverages findOne to enforce all access control logic securely
    const tour = await this.findOne(id, user);

    // Any customized shaping for the 3D Engine is handled here.
    // Right now, findOne correctly returns the entire tree of panoramas, tags, and scans natively.
    return tour;
  }

  async createScan(tourId: string, dto: CreateScanDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add a scan');
    }

    if (dto.targetScanId) {
      const targetScan = await this.prisma.scan.findUnique({ where: { id: dto.targetScanId } });
      if (!targetScan) throw new NotFoundException('Target scan not found');
      if (targetScan.tourId !== tourId) {
        throw new ForbiddenException('Target scan must belong to the same tour');
      }
    }

    return this.prisma.scan.create({
      data: {
        ...dto,
        tourId,
      },
    });
  }

  async createPanorama(tourId: string, dto: CreatePanoramaDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add a panorama');
    }

    return this.prisma.panorama.create({
      data: {
        ...dto,
        status: ProcessingStatus.PENDING,
        tourId,
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

  async setPermissions(id: string, dto: UpdateTourPermissionsDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can update permissions');
    }

    return this.prisma.tour.update({
      where: { id },
      data: {
        authorizedViewers: {
          set: dto.authorizedViewerIds.map((vId) => ({ id: vId })),
        },
      },
      include: { authorizedViewers: true }
    });
  }

  async remove(id: string, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete this tour');
    }

    return this.prisma.tour.delete({ where: { id } });
  }

  async getUploadUrl(id: string, fileName: string, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can upload files to this tour');
    }

    // Use Minio StorageService
    const bucket = 'virtual-tours';
    const s3Path = `tours/${id}/${fileName}`;
    const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);

    // Optionally update the DB here if it's the main GLB model, or handle via a separate endpoint
    if (fileName.endsWith('.glb')) {
      await this.prisma.tour.update({
        where: { id },
        data: { glbModelUrl: s3Path },
      });
    } else if (fileName.endsWith('scans.json')) {
      await this.prisma.tour.update({
        where: { id },
        data: { scansJsonUrl: s3Path },
      });
    }


    return { presignedUrl, expectedPath: s3Path };
  }

  // ─── Tag CRUD ───────────────────────────────────────────────

  async createTag(tourId: string, dto: CreateTagDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add tags');
    }

    return this.prisma.tag.create({
      data: {
        title: dto.title,
        description: dto.description,
        posX: dto.posX,
        posY: dto.posY,
        posZ: dto.posZ,
        tourId,
      },
      include: { documents: true },
    });
  }

  async updateTag(tourId: string, tagId: string, dto: UpdateTagDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can edit tags');
    }

    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.tourId !== tourId) throw new NotFoundException('Tag not found in this tour');

    return this.prisma.tag.update({
      where: { id: tagId },
      data: dto,
      include: { documents: true },
    });
  }

  async deleteTag(tourId: string, tagId: string, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete tags');
    }

    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.tourId !== tourId) throw new NotFoundException('Tag not found in this tour');

    return this.prisma.tag.delete({ where: { id: tagId } });
  }

  async addTagDocument(tourId: string, tagId: string, dto: CreateTagDocumentDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can upload tag documents');
    }

    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.tourId !== tourId) throw new NotFoundException('Tag not found in this tour');

    const bucket = 'virtual-tours';
    const s3Path = `tours/${tourId}/tags/${tagId}/${dto.fileName}`;
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

  async deleteTagDocument(tourId: string, tagId: string, docId: string, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete tag documents');
    }

    const doc = await this.prisma.tagDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.tagId !== tagId) throw new NotFoundException('Document not found on this tag');

    return this.prisma.tagDocument.delete({ where: { id: docId } });
  }

  // ─── Area Pointer CRUD ────────────────────────────────────────

  async createAreaPointer(tourId: string, dto: CreateAreaPointerDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can add area pointers');
    }

    return this.prisma.areaPointer.create({
      data: {
        name: dto.name,
        color: dto.color,
        posX: dto.posX,
        posY: dto.posY,
        posZ: dto.posZ,
        tourId,
      },
    });
  }

  async updateAreaPointer(tourId: string, pointerId: string, dto: UpdateAreaPointerDto, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can edit area pointers');
    }

    const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
    if (!pointer || pointer.tourId !== tourId) throw new NotFoundException('Area pointer not found in this tour');

    return this.prisma.areaPointer.update({
      where: { id: pointerId },
      data: dto,
    });
  }

  async deleteAreaPointer(tourId: string, pointerId: string, userId: string, role: Role) {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException('Tour not found');

    if (tour.creatorId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can delete area pointers');
    }

    const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
    if (!pointer || pointer.tourId !== tourId) throw new NotFoundException('Area pointer not found in this tour');

    return this.prisma.areaPointer.delete({ where: { id: pointerId } });
  }
}
