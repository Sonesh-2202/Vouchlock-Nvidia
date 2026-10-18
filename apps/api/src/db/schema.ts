/**
 * PostgreSQL schema for ProjectPilot.
 * Matches the data model in 04-data-model-and-api.md.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ──

export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'admin', 'member']);
export const projectStatusEnum = pgEnum('project_status', ['active', 'archived']);
export const taskStatusEnum = pgEnum('task_status', [
  'backlog',
  'todo',
  'doing',
  'blocked',
  'done',
]);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'normal', 'high']);
export const aiGenKindEnum = pgEnum('ai_gen_kind', [
  'plan_draft',
  'task_breakdown',
  'progress_summary',
  'requirement_extraction',
  'copilot_report',
]);
export const requirementCategoryEnum = pgEnum('requirement_category', [
  'functional',
  'non_functional',
  'constraint',
  'deliverable',
]);
export const requirementPriorityEnum = pgEnum('requirement_priority', ['low', 'normal', 'high']);
export const requirementStatusEnum = pgEnum('requirement_status', [
  'draft',
  'active',
  'verified',
  'blocked',
  'deprecated',
]);
export const evidenceTypeEnum = pgEnum('evidence_type', ['url', 'note']);
export const verificationStatusEnum = pgEnum('verification_status', [
  'verified',
  'rejected',
  'unverified',
]);
export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export const jobExecutionTargetEnum = pgEnum('job_execution_target', [
  'nebius_serverless_job',
  'local_worker',
]);

// ── Users ──

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }),
    normalizedEmail: varchar('normalized_email', { length: 255 }),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    normalizedEmailIdx: uniqueIndex('users_normalized_email_idx').on(table.normalizedEmail),
  }),
);

// ── Identity Links ──

export const identityLinks = pgTable(
  'identity_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
  },
  (table) => ({
    providerSubjectIdx: uniqueIndex('identity_links_provider_subject_idx').on(
      table.provider,
      table.providerSubject,
    ),
    userIdIdx: index('identity_links_user_id_idx').on(table.userId),
  }),
);

// ── Workspaces ──

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    ownerUserIdIdx: index('workspaces_owner_user_id_idx').on(table.ownerUserId),
  }),
);

// ── Workspace Members ──

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    invitedBy: uuid('invited_by'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  }),
);

// ── Invitations ──

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invitedEmail: varchar('invited_email', { length: 255 }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    role: workspaceRoleEnum('role').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('invitations_token_hash_idx').on(table.tokenHash),
    workspaceIdIdx: index('invitations_workspace_id_idx').on(table.workspaceId),
  }),
);

// ── Projects ──

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    goal: text('goal').notNull(),
    audience: text('audience'),
    deliverable: text('deliverable'),
    deadline: timestamp('deadline', { withTimezone: true }),
    constraints: jsonb('constraints').default({}),
    successMeasures: jsonb('success_measures').default({}),
    status: projectStatusEnum('status').notNull().default('active'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    workspaceIdIdx: index('projects_workspace_id_idx').on(table.workspaceId),
    statusIdx: index('projects_status_idx').on(table.status),
  }),
);

// ── Milestones ──

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdIdx: index('milestones_project_id_idx').on(table.projectId),
  }),
);

// ── Tasks ──

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('backlog'),
    priority: taskPriorityEnum('priority').notNull().default('normal'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    projectIdIdx: index('tasks_project_id_idx').on(table.projectId),
    statusIdx: index('tasks_status_idx').on(table.status),
    assigneeIdx: index('tasks_assignee_idx').on(table.assigneeUserId),
    dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
  }),
);

// ── Task Dependencies ──

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    noSelfDependency: check('no_self_dependency', sql`task_id <> depends_on_task_id`),
  }),
);

// ── Comments ──

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    taskIdIdx: index('comments_task_id_idx').on(table.taskId),
  }),
);

// ── AI Generations ──

export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id),
    kind: aiGenKindEnum('kind').notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    outputJson: jsonb('output_json').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdIdx: index('ai_generations_project_id_idx').on(table.projectId),
  }),
);

// ── Audit Events ──

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    subjectType: varchar('subject_type', { length: 50 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdIdx: index('audit_events_workspace_id_idx').on(table.workspaceId),
    createdAtIdx: index('audit_events_created_at_idx').on(table.createdAt),
  }),
);

// ── Requirements ──

export const requirements = pgTable(
  'requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    category: requirementCategoryEnum('category').notNull().default('functional'),
    priority: requirementPriorityEnum('priority').notNull().default('normal'),
    status: requirementStatusEnum('status').notNull().default('draft'),
    sourceReference: varchar('source_reference', { length: 500 }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    projectIdIdx: index('requirements_project_id_idx').on(table.projectId),
    statusIdx: index('requirements_status_idx').on(table.status),
    categoryIdx: index('requirements_category_idx').on(table.category),
  }),
);

// ── Requirement Tasks (Many-to-Many) ──

export const requirementTasks = pgTable(
  'requirement_tasks',
  {
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.requirementId, table.taskId] }),
    taskIdIdx: index('requirement_tasks_task_id_idx').on(table.taskId),
  }),
);

// ── Evidence ──

export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    type: evidenceTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requirementIdIdx: index('evidence_requirement_id_idx').on(table.requirementId),
    projectIdIdx: index('evidence_project_id_idx').on(table.projectId),
    taskIdIdx: index('evidence_task_id_idx').on(table.taskId),
  }),
);

// ── Verifications ──

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'cascade' }),
    verifiedByUserId: uuid('verified_by_user_id')
      .notNull()
      .references(() => users.id),
    status: verificationStatusEnum('status').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requirementIdIdx: index('verifications_requirement_id_idx').on(table.requirementId),
    createdAtIdx: index('verifications_created_at_idx').on(table.createdAt),
  }),
);

// ── Project Brief Revisions ──

export const projectBriefRevisions = pgTable(
  'project_brief_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    title: varchar('title', { length: 200 }).notNull().default('Project Brief'),
    content: text('content').notNull(),
    notes: text('notes'),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdIdx: index('project_brief_revisions_project_id_idx').on(table.projectId),
    projectRevUniqueIdx: uniqueIndex('project_brief_revisions_unique_rev_idx').on(
      table.projectId,
      table.revisionNumber,
    ),
  }),
);

// ── MCP Tokens ──

export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    scopes: jsonb('scopes').notNull().$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('mcp_tokens_token_hash_idx').on(table.tokenHash),
    userIdIdx: index('mcp_tokens_user_id_idx').on(table.userId),
    workspaceIdIdx: index('mcp_tokens_workspace_id_idx').on(table.workspaceId),
  }),
);

// ── Serverless Jobs (Asynchronous Delivery Workflows) ──

export const serverlessJobs = pgTable(
  'serverless_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobType: varchar('job_type', { length: 100 }).notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    executionTarget: jobExecutionTargetEnum('execution_target').notNull().default('local_worker'),
    modelId: varchar('model_id', { length: 255 }),
    modelRole: varchar('model_role', { length: 50 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    inputParams: jsonb('input_params').notNull().$type<Record<string, unknown>>(),
    progressPercent: integer('progress_percent').notNull().default(0),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    cloudJobId: varchar('cloud_job_id', { length: 255 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdIdx: index('serverless_jobs_workspace_id_idx').on(table.workspaceId),
    projectIdIdx: index('serverless_jobs_project_id_idx').on(table.projectId),
    userIdIdx: index('serverless_jobs_user_id_idx').on(table.userId),
    idempotencyIdx: index('serverless_jobs_idempotency_idx').on(table.workspaceId, table.idempotencyKey),
    statusIdx: index('serverless_jobs_status_idx').on(table.status),
  }),
);

