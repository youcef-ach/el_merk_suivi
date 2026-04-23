import { Controller, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';

@Controller('inspections/:inspectionId/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post()
  create(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: CreateTagDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createTag(inspectionId, dto, user.id, user.role);
  }

  @Patch(':tagId')
  update(
    @Param('inspectionId') inspectionId: string,
    @Param('tagId') tagId: string,
    @Body() dto: UpdateTagDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.updateTag(inspectionId, tagId, dto, user.id, user.role);
  }

  @Delete(':tagId')
  remove(
    @Param('inspectionId') inspectionId: string,
    @Param('tagId') tagId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.deleteTag(inspectionId, tagId, user.id, user.role);
  }

  @Post(':tagId/documents')
  addDocument(
    @Param('inspectionId') inspectionId: string,
    @Param('tagId') tagId: string,
    @Body() dto: CreateTagDocumentDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.addTagDocument(inspectionId, tagId, dto, user.id, user.role);
  }

  @Delete(':tagId/documents/:docId')
  removeDocument(
    @Param('inspectionId') inspectionId: string,
    @Param('tagId') tagId: string,
    @Param('docId') docId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.deleteTagDocument(inspectionId, tagId, docId, user.id, user.role);
  }
}
