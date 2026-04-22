import { Controller, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ToursService } from './tours.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';

@Controller('tours/:tourId/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly toursService: ToursService) {}

  @Post()
  create(
    @Param('tourId') tourId: string,
    @Body() dto: CreateTagDto,
    @GetUser() user: any,
  ) {
    return this.toursService.createTag(tourId, dto, user.id, user.role);
  }

  @Patch(':tagId')
  update(
    @Param('tourId') tourId: string,
    @Param('tagId') tagId: string,
    @Body() dto: UpdateTagDto,
    @GetUser() user: any,
  ) {
    return this.toursService.updateTag(tourId, tagId, dto, user.id, user.role);
  }

  @Delete(':tagId')
  remove(
    @Param('tourId') tourId: string,
    @Param('tagId') tagId: string,
    @GetUser() user: any,
  ) {
    return this.toursService.deleteTag(tourId, tagId, user.id, user.role);
  }

  @Post(':tagId/documents')
  addDocument(
    @Param('tourId') tourId: string,
    @Param('tagId') tagId: string,
    @Body() dto: CreateTagDocumentDto,
    @GetUser() user: any,
  ) {
    return this.toursService.addTagDocument(tourId, tagId, dto, user.id, user.role);
  }

  @Delete(':tagId/documents/:docId')
  removeDocument(
    @Param('tourId') tourId: string,
    @Param('tagId') tagId: string,
    @Param('docId') docId: string,
    @GetUser() user: any,
  ) {
    return this.toursService.deleteTagDocument(tourId, tagId, docId, user.id, user.role);
  }
}
