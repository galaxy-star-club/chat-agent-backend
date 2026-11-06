ALTER TABLE "Chat" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Chat_ownerId_isFavorite_createdAt_id_idx"
ON "Chat"("ownerId", "isFavorite", "createdAt", "id");
