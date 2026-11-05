-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "coverColor" "LabelColor";

-- CreateTable
CREATE TABLE "CardMember" (
    "cardId" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardMember_pkey" PRIMARY KEY ("cardId","userId")
);

-- CreateTable
CREATE TABLE "CardWatch" (
    "cardId" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardWatch_pkey" PRIMARY KEY ("cardId","userId")
);

-- CreateIndex
CREATE INDEX "CardMember_userId_boardId_idx" ON "CardMember"("userId", "boardId");

-- CreateIndex
CREATE INDEX "CardWatch_userId_boardId_idx" ON "CardWatch"("userId", "boardId");

-- AddForeignKey
ALTER TABLE "CardMember" ADD CONSTRAINT "CardMember_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMember" ADD CONSTRAINT "CardMember_boardId_userId_fkey" FOREIGN KEY ("boardId", "userId") REFERENCES "BoardMember"("boardId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardWatch" ADD CONSTRAINT "CardWatch_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardWatch" ADD CONSTRAINT "CardWatch_boardId_userId_fkey" FOREIGN KEY ("boardId", "userId") REFERENCES "BoardMember"("boardId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
