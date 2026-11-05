-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'CARD_ATTACHMENT_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'CARD_ATTACHMENT_REMOVED';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "attachmentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coverAttachmentId" UUID;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_cardId_createdAt_id_idx" ON "Attachment"("cardId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Attachment_boardId_idx" ON "Attachment"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_coverAttachmentId_key" ON "Card"("coverAttachmentId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_coverAttachmentId_fkey" FOREIGN KEY ("coverAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

