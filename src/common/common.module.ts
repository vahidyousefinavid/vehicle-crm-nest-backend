import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogItem } from '../catalog/catalog-item.entity';
import { AdminPermission } from '../admins/admin-permission.entity';
import { SchemaBootstrapService } from './schema-bootstrap.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CatalogItem, AdminPermission])],
  providers: [SchemaBootstrapService],
  exports: [SchemaBootstrapService],
})
export class CommonModule {}
