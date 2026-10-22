-- CreateEnum
CREATE TYPE "SpaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BorrowingStatus" AS ENUM ('GOOD', 'RESTRICTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('SITE', 'BUILDING', 'FLOOR', 'ROOM', 'AREA', 'CABINET', 'SHELF', 'BIN', 'OTHER');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('QUANTITY', 'SERIALIZED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ON_LOAN', 'IN_TRANSIT', 'MAINTENANCE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT', 'COUNT', 'ISSUE', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_RETURN', 'TRANSFER_LOSS', 'MOVE', 'LOSS', 'DAMAGE', 'REPAIR', 'WRITE_OFF', 'RESERVE', 'RELEASE', 'IMPORT');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('RECEIVED', 'FOUND', 'CORRECTION', 'CONSUMED', 'LOST', 'DAMAGED', 'EXPIRED', 'STOLEN', 'DONATED', 'RETURNED_TO_SUPPLIER', 'OTHER');

-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'RETURNING', 'RETURNED');

-- CreateEnum
CREATE TYPE "TransferAssetState" AS ENUM ('ASSIGNED', 'DISPATCHED', 'RECEIVED', 'DAMAGED', 'MISSING', 'RETURNING', 'RETURNED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED_WITH_ISSUE');

-- CreateEnum
CREATE TYPE "DepositMode" AS ENUM ('NONE', 'FIXED', 'PER_ITEM');

-- CreateEnum
CREATE TYPE "RentalMode" AS ENUM ('FREE', 'PER_DAY', 'PER_WEEK', 'FLAT');

-- CreateEnum
CREATE TYPE "DamageChargeMode" AS ENUM ('NONE', 'REPLACEMENT_COST', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'STRIPE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AWAITING_CONFIRMATION', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('DEPOSIT', 'RENTAL', 'LATE_FEE', 'DAMAGE', 'LOSS');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('DUE', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "LabelSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('ISSUE', 'RETURN', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'INCIDENT');

-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IncidentResolution" AS ENUM ('REPAIRED', 'REPLACED', 'PAID', 'FOUND', 'WAIVED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "image" TEXT,
    "phone" TEXT,
    "mfaSecretEncrypted" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "isInstanceAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalHeartbeat" (
    "key" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastSent" INTEGER NOT NULL DEFAULT 0,
    "lastFailed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalHeartbeat_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT,
    "actorId" TEXT,
    "actorApiTokenId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "address" TEXT,
    "contactEmail" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "tagPrefix" TEXT NOT NULL DEFAULT 'SW',
    "lendingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publicCatalogue" BOOLEAN NOT NULL DEFAULT false,
    "selfCheckoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultLoanDays" INTEGER NOT NULL DEFAULT 7,
    "maxLoanDays" INTEGER NOT NULL DEFAULT 30,
    "maxActiveLoans" INTEGER NOT NULL DEFAULT 5,
    "maxItemsOnLoan" INTEGER NOT NULL DEFAULT 0,
    "maxRenewals" INTEGER NOT NULL DEFAULT 1,
    "renewalDays" INTEGER NOT NULL DEFAULT 7,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 1,
    "overdueReminderDays" INTEGER NOT NULL DEFAULT 2,
    "restrictWhenOverdue" BOOLEAN NOT NULL DEFAULT true,
    "restrictOnIncident" BOOLEAN NOT NULL DEFAULT true,
    "acceptsTransfers" BOOLEAN NOT NULL DEFAULT true,
    "shareStockWithSpaces" BOOLEAN NOT NULL DEFAULT true,
    "selfJoin" BOOLEAN NOT NULL DEFAULT false,
    "requireVerifiedEmail" BOOLEAN NOT NULL DEFAULT true,
    "requireMemberNumber" BOOLEAN NOT NULL DEFAULT false,
    "minEvidencePhotos" INTEGER NOT NULL DEFAULT 1,
    "requireContainer" BOOLEAN NOT NULL DEFAULT false,
    "requireIssueRemarks" BOOLEAN NOT NULL DEFAULT false,
    "depositMode" "DepositMode" NOT NULL DEFAULT 'NONE',
    "depositMinor" INTEGER NOT NULL DEFAULT 0,
    "rentalMode" "RentalMode" NOT NULL DEFAULT 'FREE',
    "rentalMinor" INTEGER NOT NULL DEFAULT 0,
    "lateFeePerDayMinor" INTEGER NOT NULL DEFAULT 0,
    "lateFeeCapMinor" INTEGER NOT NULL DEFAULT 0,
    "lateFeeGraceDays" INTEGER NOT NULL DEFAULT 0,
    "damageChargeMode" "DamageChargeMode" NOT NULL DEFAULT 'NONE',
    "damageChargeMinor" INTEGER NOT NULL DEFAULT 0,
    "paymentBeforeIssue" BOOLEAN NOT NULL DEFAULT true,
    "payLaterEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyStaffOnRequest" BOOLEAN NOT NULL DEFAULT true,
    "notifyLowStock" BOOLEAN NOT NULL DEFAULT true,
    "overdueEscalateDays" INTEGER NOT NULL DEFAULT 3,
    "internalTransferApproval" BOOLEAN NOT NULL DEFAULT true,
    "labelSize" "LabelSize" NOT NULL DEFAULT 'MEDIUM',
    "labelShowName" BOOLEAN NOT NULL DEFAULT true,
    "labelShowLocation" BOOLEAN NOT NULL DEFAULT false,
    "defaultReorderPoint" INTEGER,
    "countVarianceThreshold" INTEGER,
    "logoKey" TEXT,
    "setupCompletedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "borrowingStatus" "BorrowingStatus" NOT NULL DEFAULT 'GOOD',
    "borrowingNote" TEXT,
    "borrowingAuto" BOOLEAN NOT NULL DEFAULT false,
    "memberNumber" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceCounter" (
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SpaceCounter_pkey" PRIMARY KEY ("spaceId","name")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "LocationKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "loanDays" INTEGER,
    "depositMinor" INTEGER,
    "rentalMode" "RentalMode",
    "rentalMinor" INTEGER,
    "lateFeePerDayMinor" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "unitId" TEXT,
    "supplierId" TEXT,
    "tracking" "TrackingMode" NOT NULL DEFAULT 'QUANTITY',
    "qrCode" TEXT NOT NULL,
    "barcode" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unitCostMinor" INTEGER NOT NULL DEFAULT 0,
    "avgCostMinor" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER,
    "reorderQuantity" INTEGER,
    "lowStockAlertAt" TIMESTAMP(3),
    "lendable" BOOLEAN NOT NULL DEFAULT false,
    "consumable" BOOLEAN NOT NULL DEFAULT false,
    "selfCheckout" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "loanDays" INTEGER,
    "replacementMinor" INTEGER,
    "depositMinor" INTEGER,
    "rentalMode" "RentalMode",
    "rentalMinor" INTEGER,
    "lateFeePerDayMinor" INTEGER,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemImage" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "serialNumber" TEXT,
    "locationId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "purchasedAt" TIMESTAMP(3),
    "purchaseCostMinor" INTEGER,
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "quarantined" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT,
    "assetId" TEXT,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "quarantinedDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "unitCostMinor" INTEGER,
    "reason" "AdjustmentReason",
    "note" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "actorId" TEXT,
    "actorApiTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "assetId" TEXT,
    "quantity" INTEGER NOT NULL,
    "loanLineId" TEXT,
    "transferLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CountStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "varianceThreshold" INTEGER,
    "locationId" TEXT,
    "categoryId" TEXT,
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "startedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountScan" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "scannedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kit" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "qrCode" TEXT NOT NULL,
    "lendable" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitLine" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "KitLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "name" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplierId" TEXT,
    "unitCostMinor" INTEGER,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'REQUESTED',
    "link" TEXT,
    "note" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedLocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sourceSpaceId" TEXT NOT NULL,
    "destSpaceId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "destLocationId" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "initiatedBySpaceId" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "neededBy" TIMESTAMP(3),
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "dispatchedById" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "carrier" TEXT,
    "trackingRef" TEXT,
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "returnReason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "destItemId" TEXT,
    "quantityRequested" INTEGER NOT NULL,
    "quantityApproved" INTEGER NOT NULL DEFAULT 0,
    "quantityDispatched" INTEGER NOT NULL DEFAULT 0,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "quantityMissing" INTEGER NOT NULL DEFAULT 0,
    "quantityReturning" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLineAsset" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "state" "TransferAssetState" NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "TransferLineAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferEvent" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'REQUESTED',
    "purpose" TEXT,
    "neededFrom" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "selfCheckout" BOOLEAN NOT NULL DEFAULT false,
    "containerId" TEXT,
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanLine" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "assetId" TEXT,
    "locationId" TEXT,
    "quantityRequested" INTEGER NOT NULL,
    "quantityApproved" INTEGER NOT NULL DEFAULT 0,
    "quantityIssued" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "quantityLost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoanLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "loanId" TEXT,
    "transferId" TEXT,
    "remarks" TEXT NOT NULL,
    "scannedCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidencePhoto" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidencePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanIncident" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "assetId" TEXT,
    "kind" "IncidentKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "IncidentResolution",
    "chargeMinor" INTEGER,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpacePaymentConfig" (
    "spaceId" TEXT NOT NULL,
    "razorpayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "razorpayKeyId" TEXT,
    "razorpaySecretEnc" TEXT,
    "razorpayWebhookEnc" TEXT,
    "stripeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeSecretEnc" TEXT,
    "stripeWebhookEnc" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "offlineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offlineInstructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpacePaymentConfig_pkey" PRIMARY KEY ("spaceId")
);

-- CreateTable
CREATE TABLE "LoanCharge" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'DUE',
    "paymentId" TEXT,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "waivedReason" TEXT,
    "waivedById" TEXT,
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "payLater" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayRefundId" TEXT,
    "createdById" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "spaceId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountSchedule" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT,
    "categoryId" TEXT,
    "everyDays" INTEGER NOT NULL,
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "rows" JSONB NOT NULL,
    "stats" JSONB,
    "requestedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_userId_codeHash_key" ON "MfaRecoveryCode"("userId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_userId_idx" ON "MagicLinkToken"("userId");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_availableAt_idx" ON "OutboxMessage"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_createdAt_idx" ON "OutboxMessage"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_spaceId_createdAt_idx" ON "AuditEvent"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_spaceId_targetType_targetId_idx" ON "AuditEvent"("spaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_spaceId_createdAt_idx" ON "Notification"("spaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "Membership_spaceId_role_idx" ON "Membership"("spaceId", "role");

-- CreateIndex
CREATE INDEX "Membership_spaceId_borrowingStatus_idx" ON "Membership"("spaceId", "borrowingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_spaceId_key" ON "Membership"("userId", "spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_spaceId_createdAt_idx" ON "Invitation"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_prefix_key" ON "ApiToken"("prefix");

-- CreateIndex
CREATE INDEX "ApiToken_spaceId_createdAt_idx" ON "ApiToken"("spaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Location_qrCode_key" ON "Location"("qrCode");

-- CreateIndex
CREATE INDEX "Location_spaceId_parentId_idx" ON "Location"("spaceId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_spaceId_code_key" ON "Location"("spaceId", "code");

-- CreateIndex
CREATE INDEX "Category_spaceId_parentId_idx" ON "Category"("spaceId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_spaceId_name_key" ON "Category"("spaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_spaceId_name_key" ON "Unit"("spaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_spaceId_name_key" ON "Supplier"("spaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_qrCode_key" ON "Item"("qrCode");

-- CreateIndex
CREATE INDEX "Item_spaceId_categoryId_idx" ON "Item"("spaceId", "categoryId");

-- CreateIndex
CREATE INDEX "Item_spaceId_lendable_idx" ON "Item"("spaceId", "lendable");

-- CreateIndex
CREATE INDEX "Item_spaceId_archivedAt_idx" ON "Item"("spaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Item_spaceId_sku_key" ON "Item"("spaceId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ItemImage_storageKey_key" ON "ItemImage"("storageKey");

-- CreateIndex
CREATE INDEX "ItemImage_itemId_sortOrder_idx" ON "ItemImage"("itemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_qrCode_key" ON "Asset"("qrCode");

-- CreateIndex
CREATE INDEX "Asset_spaceId_itemId_status_idx" ON "Asset"("spaceId", "itemId", "status");

-- CreateIndex
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");

-- CreateIndex
CREATE INDEX "StockLevel_spaceId_locationId_idx" ON "StockLevel"("spaceId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_itemId_locationId_key" ON "StockLevel"("itemId", "locationId");

-- CreateIndex
CREATE INDEX "StockMovement_spaceId_createdAt_idx" ON "StockMovement"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "StockReservation_spaceId_itemId_idx" ON "StockReservation"("spaceId", "itemId");

-- CreateIndex
CREATE INDEX "StockReservation_loanLineId_idx" ON "StockReservation"("loanLineId");

-- CreateIndex
CREATE INDEX "StockReservation_transferLineId_idx" ON "StockReservation"("transferLineId");

-- CreateIndex
CREATE INDEX "StockCount_spaceId_status_idx" ON "StockCount"("spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_spaceId_number_key" ON "StockCount"("spaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_itemId_locationId_key" ON "StockCountLine"("countId", "itemId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountScan_countId_assetId_key" ON "StockCountScan"("countId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Kit_qrCode_key" ON "Kit"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "Kit_spaceId_name_key" ON "Kit"("spaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "KitLine_kitId_itemId_key" ON "KitLine"("kitId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_qrCode_key" ON "Container"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "Container_spaceId_code_key" ON "Container"("spaceId", "code");

-- CreateIndex
CREATE INDEX "PurchaseItem_spaceId_status_idx" ON "PurchaseItem"("spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_spaceId_number_key" ON "PurchaseItem"("spaceId", "number");

-- CreateIndex
CREATE INDEX "Transfer_sourceSpaceId_status_idx" ON "Transfer"("sourceSpaceId", "status");

-- CreateIndex
CREATE INDEX "Transfer_destSpaceId_status_idx" ON "Transfer"("destSpaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_sourceSpaceId_number_key" ON "Transfer"("sourceSpaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TransferLine_transferId_itemId_key" ON "TransferLine"("transferId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferLineAsset_lineId_assetId_key" ON "TransferLineAsset"("lineId", "assetId");

-- CreateIndex
CREATE INDEX "TransferEvent_transferId_createdAt_idx" ON "TransferEvent"("transferId", "createdAt");

-- CreateIndex
CREATE INDEX "Loan_spaceId_status_dueAt_idx" ON "Loan"("spaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_status_idx" ON "Loan"("borrowerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_spaceId_number_key" ON "Loan"("spaceId", "number");

-- CreateIndex
CREATE INDEX "LoanLine_loanId_idx" ON "LoanLine"("loanId");

-- CreateIndex
CREATE INDEX "Evidence_spaceId_createdAt_idx" ON "Evidence"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_loanId_idx" ON "Evidence"("loanId");

-- CreateIndex
CREATE INDEX "Evidence_transferId_idx" ON "Evidence"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidencePhoto_storageKey_key" ON "EvidencePhoto"("storageKey");

-- CreateIndex
CREATE INDEX "LoanIncident_spaceId_status_idx" ON "LoanIncident"("spaceId", "status");

-- CreateIndex
CREATE INDEX "LoanIncident_borrowerId_status_idx" ON "LoanIncident"("borrowerId", "status");

-- CreateIndex
CREATE INDEX "LoanCharge_loanId_idx" ON "LoanCharge"("loanId");

-- CreateIndex
CREATE INDEX "LoanCharge_spaceId_status_idx" ON "LoanCharge"("spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "Payment"("gatewayOrderId");

-- CreateIndex
CREATE INDEX "Payment_spaceId_status_idx" ON "Payment"("spaceId", "status");

-- CreateIndex
CREATE INDEX "Payment_loanId_idx" ON "Payment"("loanId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "CountSchedule_active_nextRunAt_idx" ON "CountSchedule"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_spaceId_idx" ON "WebhookEndpoint"("spaceId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_spaceId_createdAt_idx" ON "WebhookDelivery"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_spaceId_createdAt_idx" ON "ImportJob"("spaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceSetting" ADD CONSTRAINT "InstanceSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorApiTokenId_fkey" FOREIGN KEY ("actorApiTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceCounter" ADD CONSTRAINT "SpaceCounter_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountScan" ADD CONSTRAINT "StockCountScan_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountScan" ADD CONSTRAINT "StockCountScan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kit" ADD CONSTRAINT "Kit_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitLine" ADD CONSTRAINT "KitLine_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitLine" ADD CONSTRAINT "KitLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_sourceSpaceId_fkey" FOREIGN KEY ("sourceSpaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destSpaceId_fkey" FOREIGN KEY ("destSpaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_destItemId_fkey" FOREIGN KEY ("destItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLineAsset" ADD CONSTRAINT "TransferLineAsset_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "TransferLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLineAsset" ADD CONSTRAINT "TransferLineAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferEvent" ADD CONSTRAINT "TransferEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanLine" ADD CONSTRAINT "LoanLine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanLine" ADD CONSTRAINT "LoanLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanLine" ADD CONSTRAINT "LoanLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePhoto" ADD CONSTRAINT "EvidencePhoto_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanIncident" ADD CONSTRAINT "LoanIncident_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanIncident" ADD CONSTRAINT "LoanIncident_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanIncident" ADD CONSTRAINT "LoanIncident_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "LoanLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanIncident" ADD CONSTRAINT "LoanIncident_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacePaymentConfig" ADD CONSTRAINT "SpacePaymentConfig_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanCharge" ADD CONSTRAINT "LoanCharge_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanCharge" ADD CONSTRAINT "LoanCharge_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanCharge" ADD CONSTRAINT "LoanCharge_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountSchedule" ADD CONSTRAINT "CountSchedule_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Invariants the availability module relies on ─────────────
-- Availability never goes below zero: every bucket is non-negative and the
-- held buckets never exceed what is on hand.
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_onHand_nonnegative" CHECK ("onHand" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_reserved_nonnegative" CHECK ("reserved" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_quarantined_nonnegative" CHECK ("quarantined" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_held_within_onhand" CHECK ("reserved" + "quarantined" <= "onHand");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "LoanLine" ADD CONSTRAINT "LoanLine_quantities_valid" CHECK (
  "quantityRequested" > 0 AND "quantityApproved" >= 0 AND "quantityApproved" <= "quantityRequested"
  AND "quantityIssued" >= 0 AND "quantityIssued" <= "quantityApproved"
  AND "quantityReturned" >= 0 AND "quantityDamaged" >= 0 AND "quantityLost" >= 0
  AND "quantityReturned" + "quantityDamaged" + "quantityLost" <= "quantityIssued"
);

ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_quantities_valid" CHECK (
  "quantityRequested" > 0 AND "quantityApproved" >= 0 AND "quantityApproved" <= "quantityRequested"
  AND "quantityDispatched" >= 0 AND "quantityDispatched" <= "quantityApproved"
  AND "quantityReceived" >= 0 AND "quantityDamaged" >= 0 AND "quantityMissing" >= 0
  AND "quantityReturning" >= 0 AND "quantityReturned" >= 0 AND "quantityReturned" <= "quantityReturning"
  AND "quantityReceived" + "quantityDamaged" + "quantityMissing" + "quantityReturning" <= "quantityDispatched"
);

ALTER TABLE "KitLine" ADD CONSTRAINT "KitLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "LoanCharge" ADD CONSTRAINT "LoanCharge_amounts_valid" CHECK ("amountMinor" >= 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0);

-- One active loan per container (issued or partially returned).
CREATE UNIQUE INDEX "Loan_one_active_per_container" ON "Loan" ("containerId")
  WHERE "containerId" IS NOT NULL AND "status" IN ('ISSUED', 'PARTIALLY_RETURNED');

-- Evidence, the stock ledger and the audit log are append-only. The only
-- update allowed is a foreign key set to NULL by ON DELETE SET NULL (the
-- columns named in the trigger arguments).
CREATE FUNCTION swi_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
  col text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF new_row -> col = 'null'::jsonb THEN
      old_row := old_row - col;
      new_row := new_row - col;
    END IF;
  END LOOP;
  IF old_row IS DISTINCT FROM new_row THEN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EvidencePhoto_append_only" BEFORE UPDATE ON "EvidencePhoto" FOR EACH ROW EXECUTE FUNCTION swi_append_only();
CREATE TRIGGER "Evidence_append_only" BEFORE UPDATE ON "Evidence" FOR EACH ROW EXECUTE FUNCTION swi_append_only('loanId');
CREATE TRIGGER "StockMovement_append_only" BEFORE UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION swi_append_only('assetId');
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION swi_append_only('actorId', 'actorApiTokenId');
