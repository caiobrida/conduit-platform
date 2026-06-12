import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { updateStatusSchema } from '@org/shared-types';
import type { UpdateStatusInput } from '@org/shared-types';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/authenticated-admin';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminServiceRequestsService } from './admin-service-requests.service';
import {
  listServiceRequestsQuerySchema,
  SORTABLE_FIELDS,
} from './list-service-requests.query';
import type { ListServiceRequestsQuery } from './list-service-requests.query';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/service-requests')
export class AdminController {
  constructor(private readonly service: AdminServiceRequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'Service request queue (pagination, sorting, filters, search)',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  @ApiQuery({ name: 'sortBy', required: false, enum: SORTABLE_FIELDS })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Matches protocol, reporter name or phone',
  })
  @ApiResponse({ status: 200, description: 'Paginated queue' })
  @ApiResponse({ status: 401, description: 'Missing/invalid Clerk token' })
  list(
    @Query(new ZodValidationPipe(listServiceRequestsQuerySchema))
    query: ListServiceRequestsQuery,
  ) {
    return this.service.list(query);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Apply a status transition (state machine B8)' })
  @ApiResponse({ status: 200, description: 'Updated service request' })
  @ApiResponse({ status: 400, description: 'Invalid transition' })
  @ApiResponse({ status: 404, description: 'Service request not found' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: UpdateStatusInput,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.updateStatus(id, body, admin.adminUserId);
  }
}
