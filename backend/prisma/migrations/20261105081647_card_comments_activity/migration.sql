-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CARD_CREATED', 'CARD_MOVED', 'CARD_ARCHIVED', 'CARD_RESTORED', 'CARD_COMPLETED', 'CARD_UNCOMPLETED', 'CARD_MEMBER_ADDED', 'CARD_MEMBER_REMOVED');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_cardId_createdAt_id_idx" ON "Comment"("cardId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Comment_boardId_createdAt_idx" ON "Comment"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_cardId_createdAt_id_idx" ON "Activity"("cardId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Activity_boardId_createdAt_idx" ON "Activity"("boardId", "createdAt");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
