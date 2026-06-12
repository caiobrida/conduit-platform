import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatusTransitionService } from '../service-requests/status-transition.service';
import { AdminController } from './admin.controller';
import { AdminServiceRequestsService } from './admin-service-requests.service';
import { EventsGateway } from '../realtime/events.gateway';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminServiceRequestsService,
    StatusTransitionService,
    EventsGateway,
  ],
})
export class AdminModule {}
