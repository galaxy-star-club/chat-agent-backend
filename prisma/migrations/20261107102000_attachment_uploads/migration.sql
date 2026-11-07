ALTER TABLE "Attachment" ADD COLUMN "assemblyId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "url" TEXT;
CREATE INDEX "Attachment_assemblyId_idx" ON "Attachment"("assemblyId");
