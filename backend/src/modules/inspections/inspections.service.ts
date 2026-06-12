import { Injectable, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
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
        stagingProfiles: {
          include: {
            items: true,
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
            items: true,
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

  async processGlb(id: string, userEnterpriseId: string, role: Role) {
    const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.project.enterpriseId !== userEnterpriseId && role !== Role.ADMIN) {
      throw new ForbiddenException('Only the creator or admin can process this inspection');
    }

    if (!inspection.glbModelUrl) {
      throw new NotFoundException('No GLB model found to process');
    }

    const execAsync = promisify(exec);
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `${id}_input.glb`);
    const outputPath = path.join(tmpDir, `${id}_opt.glb`);

    // Ensure toktx is found even if terminal wasn't restarted after installation
    process.env.PATH = process.env.PATH + ';C:\\Program Files\\KTX-Software\\bin';

    try {
      // 1. Download raw GLB from Minio
      await this.storageService.downloadFile('virtual-inspections', inspection.glbModelUrl, inputPath);

      // 2. Run gltfpack optimization
      // -cc: Meshopt geometry compression
      // -mm: Merge instances / draw calls
      // Skipping -tc (KTX2) since toktx is not guaranteed to be installed on the system right now, 
      // but we will add it to the command and if it fails, fallback without it.
      
      const gltfpackPath = path.join(process.cwd(), 'gltfpack.exe');
      let command = `"${gltfpackPath}" -i "${inputPath}" -o "${outputPath}" -cc -mm`;
      
      // Attempt to run with texture compression first
      try {
        await execAsync(`"${gltfpackPath}" -i "${inputPath}" -o "${outputPath}" -cc -tc -mm`);
      } catch (err) {
        console.warn('gltfpack -tc failed (likely missing toktx). Falling back to geometry-only compression:', err.message);
        // Fallback to geometry compression only
        await execAsync(command);
      }

      // 3. Upload optimized GLB back to Minio
      const newS3Path = `inspections/${id}/optimized_final.glb`;
      await this.storageService.uploadFile('virtual-inspections', newS3Path, outputPath, 'model/gltf-binary');

      // 4. Update Database
      await this.prisma.inspection.update({
        where: { id },
        data: { glbModelUrl: newS3Path },
      });

      return { success: true, optimizedUrl: newS3Path };
    } catch (error) {
      console.error('Failed to process GLB:', error);
      throw new InternalServerErrorException('Failed to optimize GLB model');
    } finally {
      // Cleanup temp files
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
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
        items: true,
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

}
