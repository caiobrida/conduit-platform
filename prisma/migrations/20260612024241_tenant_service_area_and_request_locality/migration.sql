-- CreateEnum
CREATE TYPE "service_area_level" AS ENUM ('CITY', 'STATE', 'COUNTRY');

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "service_area_level" "service_area_level",
ADD COLUMN     "service_area_values" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_city_idx" ON "service_requests"("tenant_id", "city");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_state_idx" ON "service_requests"("tenant_id", "state");
