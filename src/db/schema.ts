import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const adminRole = pgEnum("admin_role", ["owner", "manager"]);
export const assetKind = pgEnum("asset_kind", [
  "logo",
  "favicon",
  "og_image",
  "store_photo",
  "category_icon",
  "vacancy_image"
]);
export const catalogVersionStatus = pgEnum("catalog_version_status", [
  "draft",
  "active",
  "archived",
  "rolled_back"
]);
export const productStatus = pgEnum("product_status", [
  "active",
  "archived",
  "needs_review",
  "invalid"
]);
export const importStatus = pgEnum("import_status", [
  "uploaded",
  "analyzed",
  "published",
  "cancelled",
  "failed"
]);
export const reviewStatus = pgEnum("review_status", ["open", "resolved", "ignored"]);
export const reviewWorkspaceStatus = pgEnum("review_workspace_status", [
  "open",
  "publishing",
  "published",
  "abandoned"
]);
export const reviewWorkspaceActionStatus = pgEnum("review_workspace_action_status", [
  "applied",
  "undone",
  "published"
]);
export const reviewWorkspaceItemStatus = pgEnum("review_workspace_item_status", [
  "pending",
  "excluded",
  "undone",
  "published"
]);
export const reviewReapplyRunMode = pgEnum("review_reapply_run_mode", ["dry_run", "apply"]);
export const reviewReapplyRunStatus = pgEnum("review_reapply_run_status", [
  "pending",
  "running",
  "paused",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled"
]);
export const reviewReapplyRunItemStatus = pgEnum("review_reapply_run_item_status", [
  "pending",
  "processed",
  "prepared",
  "already_pending",
  "skipped",
  "error"
]);
export const ruleMatchType = pgEnum("rule_match_type", [
  "contains",
  "starts_with",
  "exact",
  "regex"
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  fullName: varchar("full_name", { length: 255 }),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("owner"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  ...timestamps
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    adminUserIdx: index("admin_sessions_admin_user_idx").on(table.adminUserId),
    expiresIdx: index("admin_sessions_expires_idx").on(table.expiresAt)
  })
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: assetKind("kind").notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    publicPath: text("public_path").notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => ({
    kindIdx: index("assets_kind_idx").on(table.kind),
    activeIdx: index("assets_active_idx").on(table.isActive)
  })
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull().unique(),
    description: text("description"),
    iconAssetId: uuid("icon_asset_id").references(() => assets.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isAllAssortment: boolean("is_all_assortment").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    ...timestamps
  },
  (table) => ({
    activeSortIdx: index("categories_active_sort_idx").on(table.isActive, table.sortOrder)
  })
);

export const subcategories = pgTable(
  "subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 160 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isHidden: boolean("is_hidden").notNull().default(false),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    ...timestamps
  },
  (table) => ({
    categorySlugUnique: unique("subcategories_category_slug_unique").on(
      table.categoryId,
      table.slug
    ),
    categoryNameUnique: unique("subcategories_category_name_unique").on(
      table.categoryId,
      table.name
    ),
    categorySortIdx: index("subcategories_category_sort_idx").on(
      table.categoryId,
      table.isActive,
      table.sortOrder
    )
  })
);

export const catalogVersions = pgTable(
  "catalog_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: catalogVersionStatus("status").notNull().default("draft"),
    sourceFileName: varchar("source_file_name", { length: 255 }),
    sourceFileHash: varchar("source_file_hash", { length: 128 }),
    totalRows: integer("total_rows").notNull().default(0),
    parsedRows: integer("parsed_rows").notNull().default(0),
    addedCount: integer("added_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    archivedCount: integer("archived_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    notes: text("notes"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => ({
    statusIdx: index("catalog_versions_status_idx").on(table.status),
    publishedIdx: index("catalog_versions_published_idx").on(table.publishedAt)
  })
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => catalogVersions.id, { onDelete: "cascade" }),
    shopCode: varchar("shop_code", { length: 64 }).notNull(),
    rawName: text("raw_name").notNull(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    stockQuantity: numeric("stock_quantity", { precision: 14, scale: 3 }),
    stockSum: numeric("stock_sum", { precision: 14, scale: 2 }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    status: productStatus("status").notNull().default("active"),
    reviewReason: text("review_reason"),
    searchText: text("search_text").notNull().default(""),
    ...timestamps
  },
  (table) => ({
    versionCodeUnique: unique("products_version_code_unique").on(
      table.catalogVersionId,
      table.shopCode
    ),
    versionStatusIdx: index("products_version_status_idx").on(
      table.catalogVersionId,
      table.status
    ),
    codeIdx: index("products_shop_code_idx").on(table.shopCode),
    categoryIdx: index("products_category_idx").on(table.categoryId, table.subcategoryId)
  })
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogVersionId: uuid("catalog_version_id").references(() => catalogVersions.id, {
      onDelete: "set null"
    }),
    status: importStatus("status").notNull().default("uploaded"),
    sourceFileName: varchar("source_file_name", { length: 255 }).notNull(),
    storagePath: text("storage_path"),
    fileHash: varchar("file_hash", { length: 128 }),
    uploadedBy: uuid("uploaded_by").references(() => adminUsers.id, { onDelete: "set null" }),
    report: jsonb("report").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true })
  },
  (table) => ({
    statusIdx: index("import_batches_status_idx").on(table.status),
    createdIdx: index("import_batches_created_idx").on(table.createdAt)
  })
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    rawName: text("raw_name"),
    parsedShopCode: varchar("parsed_shop_code", { length: 64 }),
    parsedName: text("parsed_name"),
    stockQuantity: numeric("stock_quantity", { precision: 14, scale: 3 }),
    price: numeric("price", { precision: 12, scale: 2 }),
    stockSum: numeric("stock_sum", { precision: 14, scale: 2 }),
    validationStatus: varchar("validation_status", { length: 64 }).notNull(),
    errorMessages: jsonb("error_messages").notNull().default(sql`'[]'::jsonb`)
  },
  (table) => ({
    batchRowUnique: unique("import_rows_batch_row_unique").on(
      table.importBatchId,
      table.rowNumber
    ),
    batchStatusIdx: index("import_rows_batch_status_idx").on(
      table.importBatchId,
      table.validationStatus
    )
  })
);

export const importErrors = pgTable(
  "import_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number"),
    fieldName: varchar("field_name", { length: 120 }),
    code: varchar("code", { length: 120 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    batchIdx: index("import_errors_batch_idx").on(table.importBatchId)
  })
);

export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pattern: varchar("pattern", { length: 255 }).notNull(),
    matchType: ruleMatchType("match_type").notNull().default("contains"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => ({
    rulePriorityIdx: index("categorization_rules_priority_idx").on(
      table.isActive,
      table.priority
    ),
    patternUnique: unique("categorization_rules_pattern_unique").on(
      table.pattern,
      table.matchType,
      table.categoryId,
      table.subcategoryId
    )
  })
);

export const synonyms = pgTable(
  "synonyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTerm: varchar("source_term", { length: 160 }).notNull(),
    targetTerms: text("target_terms").array().notNull(),
    isBidirectional: boolean("is_bidirectional").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => ({
    sourceUnique: unique("synonyms_source_unique").on(table.sourceTerm),
    activeIdx: index("synonyms_active_idx").on(table.isActive)
  })
);

export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogVersionId: uuid("catalog_version_id").references(() => catalogVersions.id, {
      onDelete: "cascade"
    }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    importRowId: uuid("import_row_id").references(() => importRows.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: reviewStatus("status").notNull().default("open"),
    suggestedCategoryId: uuid("suggested_category_id").references(() => categories.id, {
      onDelete: "set null"
    }),
    suggestedSubcategoryId: uuid("suggested_subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    resolvedBy: uuid("resolved_by").references(() => adminUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    statusIdx: index("review_queue_status_idx").on(table.status),
    versionIdx: index("review_queue_version_idx").on(table.catalogVersionId),
    versionStatusCreatedIdx: index("review_queue_version_status_created_idx").on(
      table.catalogVersionId,
      table.status,
      table.createdAt
    )
  })
);

export const reviewWorkspaces = pgTable(
  "review_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceCatalogVersionId: uuid("source_catalog_version_id").references(
      () => catalogVersions.id,
      { onDelete: "set null" }
    ),
    publishedCatalogVersionId: uuid("published_catalog_version_id").references(
      () => catalogVersions.id,
      { onDelete: "set null" }
    ),
    status: reviewWorkspaceStatus("status").notNull().default("open"),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    publishedBy: uuid("published_by").references(() => adminUsers.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => ({
    sourceStatusIdx: index("review_workspaces_source_status_idx").on(
      table.sourceCatalogVersionId,
      table.status
    ),
    oneOpenSourceIdx: uniqueIndex("review_workspaces_one_open_source_idx")
      .on(table.sourceCatalogVersionId)
      .where(
        sql`${table.sourceCatalogVersionId} IS NOT NULL AND ${table.status} IN ('open', 'publishing')`
      )
  })
);

export const reviewWorkspaceActions = pgTable(
  "review_workspace_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => reviewWorkspaces.id, { onDelete: "cascade" }),
    actionType: varchar("action_type", { length: 80 }).notNull(),
    status: reviewWorkspaceActionStatus("status").notNull().default("applied"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    ruleId: uuid("rule_id").references(() => categorizationRules.id, { onDelete: "set null" }),
    rulePattern: varchar("rule_pattern", { length: 255 }),
    productCount: integer("product_count").notNull().default(0),
    excludedCount: integer("excluded_count").notNull().default(0),
    previewToken: varchar("preview_token", { length: 128 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    workspaceStatusIdx: index("review_workspace_actions_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
    previewTokenIdx: uniqueIndex("review_workspace_actions_preview_token_idx")
      .on(table.workspaceId, table.previewToken)
      .where(sql`${table.previewToken} IS NOT NULL`)
  })
);

export const reviewWorkspaceItems = pgTable(
  "review_workspace_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => reviewWorkspaces.id, { onDelete: "cascade" }),
    actionId: uuid("action_id").references(() => reviewWorkspaceActions.id, {
      onDelete: "set null"
    }),
    reviewQueueId: uuid("review_queue_id").references(() => reviewQueue.id, {
      onDelete: "set null"
    }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: reviewWorkspaceItemStatus("status").notNull().default("pending"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    originalCategoryId: uuid("original_category_id").references(() => categories.id, {
      onDelete: "set null"
    }),
    originalSubcategoryId: uuid("original_subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    originalStatus: varchar("original_status", { length: 64 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => ({
    workspaceProductUnique: unique("review_workspace_items_workspace_product_unique").on(
      table.workspaceId,
      table.productId
    ),
    workspaceStatusIdx: index("review_workspace_items_workspace_status_idx").on(
      table.workspaceId,
      table.status
    ),
    productIdx: index("review_workspace_items_product_idx").on(table.productId)
  })
);

export const reviewReapplyRuns = pgTable(
  "review_reapply_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: reviewReapplyRunMode("mode").notNull(),
    status: reviewReapplyRunStatus("status").notNull().default("pending"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => reviewWorkspaces.id, { onDelete: "cascade" }),
    sourceCatalogVersionId: uuid("source_catalog_version_id").references(
      () => catalogVersions.id,
      { onDelete: "set null" }
    ),
    dryRunId: uuid("dry_run_id"),
    pipelineVersion: varchar("pipeline_version", { length: 160 }).notNull(),
    scopeFingerprint: varchar("scope_fingerprint", { length: 128 }).notNull(),
    filters: jsonb("filters").notNull().default(sql`'{}'::jsonb`),
    totalRows: integer("total_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    preparedRows: integer("prepared_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    manualRows: integer("manual_rows").notNull().default(0),
    blockedRows: integer("blocked_rows").notNull().default(0),
    doNotPublishRows: integer("do_not_publish_rows").notNull().default(0),
    groupReviewRows: integer("group_review_rows").notNull().default(0),
    autoReadyRows: integer("auto_ready_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    alreadyPendingRows: integer("already_pending_rows").notNull().default(0),
    currentCursorCreatedAt: timestamp("current_cursor_created_at", { withTimezone: true }),
    currentCursorReviewId: uuid("current_cursor_review_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 120 }),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    errorSummary: jsonb("error_summary").notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => ({
    workspaceStatusIdx: index("review_reapply_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
    dryRunIdx: index("review_reapply_runs_dry_run_idx").on(table.dryRunId),
    activeWorkspaceUnique: uniqueIndex("review_reapply_runs_one_active_workspace_idx")
      .on(table.workspaceId)
      .where(sql`${table.status} IN ('pending', 'running', 'paused')`)
  })
);

export const reviewReapplyRunItems = pgTable(
  "review_reapply_run_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => reviewReapplyRuns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => reviewWorkspaces.id, { onDelete: "cascade" }),
    reviewQueueId: uuid("review_queue_id")
      .notNull()
      .references(() => reviewQueue.id, { onDelete: "cascade" }),
    reviewQueueCreatedAt: timestamp("review_queue_created_at", { withTimezone: true }).notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: reviewReapplyRunItemStatus("status").notNull().default("pending"),
    decisionStatus: varchar("decision_status", { length: 40 }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    confidence: numeric("confidence", { precision: 6, scale: 4 }),
    reason: text("reason"),
    reviewReasonCode: varchar("review_reason_code", { length: 120 }),
    groupKey: varchar("group_key", { length: 255 }),
    pipelineVersion: varchar("pipeline_version", { length: 160 }).notNull(),
    resultFingerprint: varchar("result_fingerprint", { length: 128 }),
    workspaceActionId: uuid("workspace_action_id").references(() => reviewWorkspaceActions.id, {
      onDelete: "set null"
    }),
    workspaceItemId: uuid("workspace_item_id").references(() => reviewWorkspaceItems.id, {
      onDelete: "set null"
    }),
    errorCode: varchar("error_code", { length: 120 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    runReviewUnique: unique("review_reapply_run_items_run_review_unique").on(
      table.runId,
      table.reviewQueueId
    ),
    runCursorIdx: index("review_reapply_run_items_run_cursor_idx").on(
      table.runId,
      table.reviewQueueCreatedAt,
      table.reviewQueueId
    ),
    workspaceReviewIdx: index("review_reapply_run_items_workspace_review_idx").on(
      table.workspaceId,
      table.reviewQueueId
    ),
    decisionIdx: index("review_reapply_run_items_decision_idx").on(table.runId, table.decisionStatus)
  })
);

export const reviewReapplyGroups = pgTable(
  "review_reapply_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => reviewReapplyRuns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => reviewWorkspaces.id, { onDelete: "cascade" }),
    decisionStatus: varchar("decision_status", { length: 40 }).notNull(),
    groupKey: varchar("group_key", { length: 255 }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "set null"
    }),
    productCount: integer("product_count").notNull().default(0),
    confidenceMin: numeric("confidence_min", { precision: 6, scale: 4 }),
    confidenceMax: numeric("confidence_max", { precision: 6, scale: 4 }),
    sample: jsonb("sample").notNull().default(sql`'[]'::jsonb`),
    reasonSummary: text("reason_summary"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => ({
    runDecisionGroupUnique: unique("review_reapply_groups_run_decision_group_unique").on(
      table.runId,
      table.decisionStatus,
      table.groupKey
    ),
    runDecisionIdx: index("review_reapply_groups_run_decision_idx").on(
      table.runId,
      table.decisionStatus
    )
  })
);

export const contacts = pgTable("contacts", {
  id: smallint("id").primaryKey().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  address: text("address").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  yandexMapsUrl: text("yandex_maps_url").notNull(),
  ...timestamps
});

export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dayOfWeek: smallint("day_of_week").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    isClosed: boolean("is_closed").notNull().default(false),
    ...timestamps
  },
  (table) => ({
    dayUnique: unique("business_hours_day_unique").on(table.dayOfWeek)
  })
);

export const vacancies = pgTable("vacancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  imageAssetId: uuid("image_asset_id").references(() => assets.id, { onDelete: "set null" }),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps
});

export const siteSettings = pgTable("site_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
      onDelete: "set null"
    }),
    action: varchar("action", { length: 160 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdIdx: index("audit_logs_created_idx").on(table.createdAt),
    adminIdx: index("audit_logs_admin_idx").on(table.adminUserId)
  })
);
