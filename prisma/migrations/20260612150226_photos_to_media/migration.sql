/*
  Warnings:

  - You are about to drop the `photos` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('PHOTO', 'VIDEO');

-- DropForeignKey
ALTER TABLE "photos" DROP CONSTRAINT "photos_service_request_id_fkey";

-- DropForeignKey
ALTER TABLE "photos" DROP CONSTRAINT "photos_tenant_id_fkey";

-- DropTable
DROP TABLE "photos";

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "type" "media_type" NOT NULL DEFAULT 'PHOTO',
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_tenant_id_idx" ON "media"("tenant_id");

-- CreateIndex
CREATE INDEX "media_service_request_id_idx" ON "media"("service_request_id");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS on the new media table (same second-layer isolation as the other
-- business tables — see migration enable_rls)
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_media ON "media"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
