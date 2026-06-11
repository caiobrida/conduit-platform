-- Enable PostGIS (required by the geography column on service_requests)

CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "category" AS ENUM ('WATER_OUTAGE', 'STREET_LEAK', 'SERVICE_LINE_LEAK', 'SEWAGE', 'LOW_PRESSURE', 'OTHER');

-- CreateEnum
CREATE TYPE "status" AS ENUM ('OPEN', 'IN_TRIAGE', 'TEAM_ASSIGNED', 'IN_FIELD', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "protocol" TEXT NOT NULL,
    "category" "category" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "status" NOT NULL DEFAULT 'OPEN',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "address_text" TEXT,
    "reporter_name" TEXT NOT NULL,
    "reporter_phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "storage_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "previous_status" "status",
    "new_status" "status" NOT NULL,
    "comment" TEXT,
    "author" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "role" "admin_role" NOT NULL DEFAULT 'OPERATOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_protocol_key" ON "service_requests"("protocol");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_idx" ON "service_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_status_idx" ON "service_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_category_idx" ON "service_requests"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_created_at_idx" ON "service_requests"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "photos_tenant_id_idx" ON "photos"("tenant_id");

-- CreateIndex
CREATE INDEX "photos_service_request_id_idx" ON "photos"("service_request_id");

-- CreateIndex
CREATE INDEX "status_events_tenant_id_idx" ON "status_events"("tenant_id");

-- CreateIndex
CREATE INDEX "status_events_service_request_id_created_at_idx" ON "status_events"("service_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_clerk_user_id_key" ON "admin_users"("clerk_user_id");

-- CreateIndex
CREATE INDEX "admin_users_tenant_id_idx" ON "admin_users"("tenant_id");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

