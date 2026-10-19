-- CreateTable
CREATE TABLE "AgeCheck" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "ipHash" TEXT,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgeCheck_token_key" ON "AgeCheck"("token");

-- CreateIndex
CREATE INDEX "AgeCheck_ipHash_expiresAt_idx" ON "AgeCheck"("ipHash", "expiresAt");

-- CreateIndex
CREATE INDEX "AgeCheck_expiresAt_idx" ON "AgeCheck"("expiresAt");

-- AddForeignKey
ALTER TABLE "AgeCheck" ADD CONSTRAINT "AgeCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
