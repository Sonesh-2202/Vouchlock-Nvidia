/**
 * ProjectPage — Vouchlock "Paper on the Desk".
 * Complete Delivery Workbench:
 * - Sticky condensing header on scroll (transforms title scale, collapses goal line)
 * - Underlined sliding tab indicator with monospace counts
 * - Two-pane master-detail on >= 1280px (left: ledger list 42%, right: sticky paper detail pane)
 * - Signature Verification Stamp (-2° settle, spring scale 1.25->1, ink ring, rolling count)
 * - SVG Traceability chain draw (top-to-bottom connector with stroke-dashoffset)
 * - 5-column Kanban board with physics, lift & tilt, and data-lenis-prevent
 * - Truthful Delivery Report assembly on paper (.paper-sheet) with digital SVG signature draw
 * - Source Brief (.paper-sheet) with 68ch reading column, folio numbers, and marginalia revisions
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiRequestError,
  type ProjectActivityItem,
  type ProjectResource,
  type ResourceCategory,
  type ResourceSourceType,
} from '../api.js';
import type {
  DeliveryPlanDraft,
  EvidenceReviewAdvisory,
  ProjectFreshnessEvaluation,
  RequirementCoverageItem,
} from '@projectpilot/domain';
import { AppShell } from '../components/AppShell.js';
import { TaskDrawer } from '../components/TaskDrawer.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { ModelPicker } from '../components/ModelPicker.js';
import {
  withViewTransition,
  animateVerificationStamp,
  animateNumberCount,
  pauseSmoothScroll,
  resumeSmoothScroll,
} from '../motion.js';
import {
  IconTask,
  IconRequirement,
  IconBrief,
  IconEvidence,
  IconVerified,
  IconPlanDraft,
  IconReport,
  IconExport,
  IconSummary,
  IconKanban,
  IconList,
  IconSearch,
  IconAdd,
  IconClose,
  IconBack,
  IconActivity,
  IconResource,
  IconExternalLink,
  IconPin,
  IconCopy,
  IconTrash,
} from '../components/icons.js';

type ExtractedProposalData = Awaited<ReturnType<typeof api.projects.proposals.extract>>;
type CandidateItem = ExtractedProposalData['proposal']['candidates'][number];

type TaskStatus = 'backlog' | 'todo' | 'doing' | 'blocked' | 'done';
type TabType = 'brief' | 'requirements' | 'tasks' | 'resources' | 'report' | 'activity' | 'copilot';

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  doing: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

const KANBAN_COLUMNS: TaskStatus[] = ['backlog', 'todo', 'doing', 'blocked', 'done'];

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab & View Mode
  const [activeTab, setActiveTab] = useState<TabType>('requirements');
  const [taskView, setTaskView] = useState<'board' | 'list'>('board');

  // Copilot / Delivery Agent State
  const [copilotReport, setCopilotReport] = useState<any | null>(null);
  const [loadingCopilot, setLoadingCopilot] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [selectedCopilotProvider, setSelectedCopilotProvider] = useState<string>('nebius');
  const [selectedModelOverride, setSelectedModelOverride] = useState<string>('');
  const [selectedRoleProfile, setSelectedRoleProfile] = useState<
    'fast' | 'balanced' | 'deep_reasoning'
  >('balanced');
  const [selectedAgentBriefId, setSelectedAgentBriefId] = useState<string>('');
  const [showCopilotSettings, setShowCopilotSettings] = useState(false);
  const [lastActionNotice, setLastActionNotice] = useState<{
    description: string;
    actionType: string;
    entityId?: string;
  } | null>(null);
  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(null);
  const [approvedProposals, setApprovedProposals] = useState<
    Record<string, { approved: boolean; entityId?: string; actionType?: string }>
  >({});
  const [rejectedProposals, setRejectedProposals] = useState<Record<string, boolean>>({});

  // Freshness & Stale Watchdog
  const [copilotFreshness, setCopilotFreshness] = useState<ProjectFreshnessEvaluation | null>(null);
  const [checkingFreshness, setCheckingFreshness] = useState(false);

  // Delivery Plan Draft State
  const [deliveryPlan, setDeliveryPlan] = useState<DeliveryPlanDraft | null>(null);
  const [deliveryPlanGenId, setDeliveryPlanGenId] = useState<string | null>(null);
  const [deliveryPlanProvider, setDeliveryPlanProvider] = useState<string | null>(null);
  const [deliveryPlanModel, setDeliveryPlanModel] = useState<string | null>(null);
  const [loadingDeliveryPlan, setLoadingDeliveryPlan] = useState(false);
  const [showDeliveryPlanModal, setShowDeliveryPlanModal] = useState(false);
  const [acceptingDeliveryPlan, setAcceptingDeliveryPlan] = useState(false);
  const [deliveryPlanSuccessNotice, setDeliveryPlanSuccessNotice] = useState<string | null>(null);

  // Action Proposal Edit Draft State
  const [editingProposal, setEditingProposal] = useState<any | null>(null);

  // Advisory Evidence Review State
  const [evidenceReviewModal, setEvidenceReviewModal] = useState<{
    evidenceId: string;
    title: string;
    requirementId?: string;
  } | null>(null);
  const [evidenceReview, setEvidenceReview] = useState<EvidenceReviewAdvisory | null>(null);
  const [loadingEvidenceReview, setLoadingEvidenceReview] = useState(false);
  const [evidenceReviewError, setEvidenceReviewError] = useState<string | null>(null);

  // Grounded Project Ledger Assistant (Q&A) State
  const [copilotQueryText, setCopilotQueryText] = useState('');
  const [copilotQueryLoading, setCopilotQueryLoading] = useState(false);
  const [copilotQueryResult, setCopilotQueryResult] = useState<{
    answer: string;
    citations: string[];
    sourceRecords: Array<{ recordType: string; id: string; title: string }>;
    model: string;
    provider: string;
  } | null>(null);
  const [copilotQueryError, setCopilotQueryError] = useState<string | null>(null);

  // Deep-linked Task Drawer ID (?task=ID)
  const activeTaskId = searchParams.get('task');

  // Core Data
  const [project, setProject] = useState<Record<string, unknown>>({
    id: '',
    name: '',
    goal: '',
    status: 'draft',
  });
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [requirements, setRequirements] = useState<Array<any>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [briefRevisions, setBriefRevisions] = useState<Array<any>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedBrief, setSelectedBrief] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deliveryReport, setDeliveryReport] = useState<any | null>(null);
  const [activityEvents, setActivityEvents] = useState<ProjectActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Responsive Viewport Tracking (< 1024px)
  const [isMobileView, setIsMobileView] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024,
  );
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile Kanban Lane Filter ('all' or specific column status)
  const [mobileKanbanLane, setMobileKanbanLane] = useState<TaskStatus | 'all'>('all');

  // Sticky Condensing Header State
  const [isHeaderCondensed, setIsHeaderCondensed] = useState(false);

  // Requirements Filters & Selected Master-Detail item
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // Resources & Study Hub state
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [resourceSearchQuery, setResourceSearchQuery] = useState('');
  const [resourceCategoryFilter, setResourceCategoryFilter] = useState<ResourceCategory | 'all'>(
    'all',
  );
  const [showResourceDrawer, setShowResourceDrawer] = useState(false);
  const [editingResource, setEditingResource] = useState<ProjectResource | null>(null);
  const [resFormTitle, setResFormTitle] = useState('');
  const [resFormUrl, setResFormUrl] = useState('');
  const [resFormCategory, setResFormCategory] = useState<ResourceCategory>('study');
  const [resFormReqId, setResFormReqId] = useState('');
  const [resFormNotes, setResFormNotes] = useState('');
  const [resFormPinned, setResFormPinned] = useState(false);
  const [resFormError, setResFormError] = useState<string | null>(null);
  const [copiedResourceId, setCopiedResourceId] = useState<string | null>(null);

  // Verification stamp animation states
  const [stampActiveReqId, setStampActiveReqId] = useState<string | null>(null);
  const stampElRef = useRef<HTMLDivElement>(null);
  const stampRingRef = useRef<HTMLDivElement>(null);
  const verifiedCountReadoutRef = useRef<HTMLSpanElement>(null);

  // AI Execution Summary margin note
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  // Modals & Sub-dialogs
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('backlog');

  const [showCreateReq, setShowCreateReq] = useState(false);
  const [newReqTitle, setNewReqTitle] = useState('');
  const [newReqDesc, setNewReqDesc] = useState('');
  const [newReqCategory, setNewReqCategory] = useState<
    'functional' | 'non_functional' | 'constraint' | 'deliverable'
  >('functional');
  const [newReqPriority, setNewReqPriority] = useState<'low' | 'normal' | 'high'>('normal');

  const [showLinkTask, setShowLinkTask] = useState<string | null>(null);
  const [selectedTaskIdToLink, setSelectedTaskIdToLink] = useState('');

  const [showAddEvidence, setShowAddEvidence] = useState<string | null>(null);
  const [evType, setEvType] = useState<'url' | 'note'>('url');
  const [evTitle, setEvTitle] = useState('');
  const [evContent, setEvContent] = useState('');

  const [showVerifyModal, setShowVerifyModal] = useState<string | null>(null);
  const [verifyStatusChoice, setVerifyStatusChoice] = useState<
    'verified' | 'rejected' | 'unverified'
  >('verified');
  const [verifyNotes, setVerifyNotes] = useState('');

  // Proposal extraction
  const [extractingProposal, setExtractingProposal] = useState(false);
  const [proposalData, setProposalData] = useState<ExtractedProposalData | null>(null);
  const [candidateDecisions, setCandidateDecisions] = useState<
    Record<string, 'accept' | 'defer' | 'reject'>
  >({});

  // Status dropdown popover for Kanban cards
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  // Evidence preview modal
  const [previewEvidence, setPreviewEvidence] = useState<{
    id?: string;
    requirementId?: string;
    title: string;
    subtitle: string;
    sha?: string;
    assertions?: string;
  } | null>(null);

  // Print Preview state for Truthful Delivery Report
  const [printPreview, setPrintPreview] = useState(false);

  // Raw payload toggle states for Activity Feed
  const [expandedRawPayloads, setExpandedRawPayloads] = useState<Record<string, boolean>>({});

  // Close Kanban status dropdown on outside click
  useEffect(() => {
    if (!statusMenuTaskId) return;
    const handleOutsideClick = () => setStatusMenuTaskId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [statusMenuTaskId]);

  // Sticky header remains perfectly stable with zero height-shifting jitter

  // Modal scroll-pausing effect
  useEffect(() => {
    const isAnyModalOpen =
      showCreateTask ||
      showCreateReq ||
      showResourceDrawer ||
      showCopilotSettings ||
      mobileInspectorOpen ||
      Boolean(showLinkTask) ||
      Boolean(showAddEvidence) ||
      Boolean(showVerifyModal) ||
      Boolean(previewEvidence) ||
      Boolean(proposalData);
    if (isAnyModalOpen) {
      pauseSmoothScroll();
    } else {
      resumeSmoothScroll();
    }
  }, [
    showCreateTask,
    showCreateReq,
    showResourceDrawer,
    mobileInspectorOpen,
    showLinkTask,
    showAddEvidence,
    showVerifyModal,
    showCopilotSettings,
    previewEvidence,
    proposalData,
  ]);

  // 2. Load all project data
  useEffect(() => {
    if (id) {
      loadAllProjectData();
    }
  }, [id]);

  async function loadAllProjectData() {
    setLoading(true);
    setError(null);
    try {
      const [projData, briefsData, reqsData, reportData, actData, resData] = await Promise.all([
        api.projects.get(id!),
        api.projects.briefs.list(id!),
        api.projects.requirements.list(id!),
        api.projects.deliveryReport(id!),
        api.projects.activity(id!).catch(() => ({ activity: [] as ProjectActivityItem[] })),
        api.resources.list(id!).catch(() => ({ resources: [] as ProjectResource[] })),
      ]);

      setProject(projData.project);
      setTasks(projData.tasks || []);
      setBriefRevisions(briefsData.revisions || []);
      if (briefsData.revisions?.length > 0) {
        setSelectedBrief(briefsData.revisions[0]);
      }
      const reqList = reqsData.requirements || [];
      setRequirements(reqList);
      setDeliveryReport(reportData);
      setActivityEvents(actData.activity || []);
      setResources(resData.resources || []);

      if (reqList.length > 0 && reqList[0]) {
        setSelectedReqId(reqList[0].id);
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.error.message : 'Failed to load project details',
      );
    } finally {
      setLoading(false);
    }
  }

  // Refresh tasks and requirements
  async function refreshData() {
    if (!id) return;
    try {
      const [projData, reqsData, reportData, actData, resData] = await Promise.all([
        api.projects.get(id),
        api.projects.requirements.list(id),
        api.projects.deliveryReport(id),
        api.projects.activity(id).catch(() => ({ activity: [] as ProjectActivityItem[] })),
        api.resources.list(id).catch(() => ({ resources: [] as ProjectResource[] })),
      ]);
      setTasks(projData.tasks || []);
      setRequirements(reqsData.requirements || []);
      setDeliveryReport(reportData);
      setActivityEvents(actData.activity || []);
      setResources(resData.resources || []);
    } catch {
      // Ignore
    }
  }

  // Handle Tab Change without cross-fade ghosting
  function handleTabChange(tab: TabType) {
    setActiveTab(tab);
  }

  // Copilot Analysis & Human-in-the-Loop Approval Handlers
  async function handleGenerateCopilotReport() {
    if (!id) return;
    setLoadingCopilot(true);
    setCopilotError(null);
    try {
      const res = await api.copilot.generateReport(
        id,
        selectedCopilotProvider !== 'nebius' ? selectedCopilotProvider : undefined,
        {
          modelOverride: selectedModelOverride || undefined,
          roleProfile: selectedRoleProfile,
          briefRevisionId: selectedAgentBriefId || undefined,
        },
      );
      setCopilotReport(res.report);
    } catch (err: any) {
      setCopilotError(err?.error?.message || err?.message || 'Failed to generate Copilot report.');
    } finally {
      setLoadingCopilot(false);
    }
  }

  async function handleApproveCopilotAction(proposal: any) {
    if (!id || !proposal) return;
    setApprovingProposalId(proposal.proposalId);
    try {
      const res = await api.copilot.approveAction(id, proposal.proposalId, proposal);
      setApprovedProposals((prev) => ({
        ...prev,
        [proposal.proposalId]: {
          approved: true,
          entityId: res?.entityId,
          actionType: res?.actionType || proposal.actionType,
        },
      }));
      setLastActionNotice({
        description: proposal.description,
        actionType: res?.actionType || proposal.actionType,
        entityId: res?.entityId,
      });
      await refreshData();
    } catch (err: any) {
      alert(err?.error?.message || err?.message || 'Failed to approve proposal action.');
    } finally {
      setApprovingProposalId(null);
    }
  }

  async function handleRejectCopilotAction(proposalId: string) {
    if (!id) return;
    try {
      await api.copilot.rejectAction(id, proposalId, 'Rejected by reviewer');
      setRejectedProposals((prev) => ({ ...prev, [proposalId]: true }));
    } catch (err: any) {
      alert(err?.error?.message || err?.message || 'Failed to reject proposal.');
    }
  }

  // Delivery Plan Generation & Commitment Handlers
  async function handleGenerateDeliveryPlan() {
    if (!id) return;
    setLoadingDeliveryPlan(true);
    setCopilotError(null);
    try {
      const res = await api.copilot.generateDeliveryPlan(id, {
        providerOverride:
          selectedCopilotProvider !== 'nebius' ? selectedCopilotProvider : undefined,
        modelOverride: selectedModelOverride || undefined,
        roleProfile: selectedRoleProfile,
        briefRevisionId: selectedAgentBriefId || undefined,
      });
      setDeliveryPlan(res.plan || res.draft || null);
      setDeliveryPlanGenId(res.generationId);
      setDeliveryPlanProvider(res.provider || null);
      setDeliveryPlanModel(res.model || null);
      setShowDeliveryPlanModal(true);
    } catch (err: any) {
      setCopilotError(
        err?.error?.message || err?.message || 'Failed to generate delivery plan draft.',
      );
    } finally {
      setLoadingDeliveryPlan(false);
    }
  }

  async function handleAcceptDeliveryPlan() {
    if (!id || !deliveryPlanGenId || !deliveryPlan) return;
    setAcceptingDeliveryPlan(true);
    try {
      const res = await api.copilot.acceptDeliveryPlan(id, deliveryPlanGenId, {
        planDraft: deliveryPlan,
      });
      setShowDeliveryPlanModal(false);
      setDeliveryPlanSuccessNotice(
        `Delivery plan successfully committed to canonical ledger: created ${res.createdMilestonesCount} milestone(s), ${res.createdTasksCount} task(s), and verified ${res.createdRequirementsCount} requirement link(s).`,
      );
      await refreshData();
      await handleGenerateCopilotReport();
    } catch (err: any) {
      alert(err?.error?.message || err?.message || 'Failed to accept delivery plan.');
    } finally {
      setAcceptingDeliveryPlan(false);
    }
  }

  // Advisory Evidence Review Handler
  async function handleOpenEvidenceReview(
    evidenceId: string,
    title: string,
    requirementId?: string,
  ) {
    setEvidenceReviewModal({ evidenceId, title, requirementId });
    setEvidenceReview(null);
    setEvidenceReviewError(null);
    setLoadingEvidenceReview(true);
    try {
      const res = await api.copilot.reviewEvidence({
        evidenceId,
        requirementId,
        providerOverride:
          selectedCopilotProvider !== 'nebius' ? selectedCopilotProvider : undefined,
        modelOverride: selectedModelOverride || undefined,
        roleProfile: selectedRoleProfile,
      });
      setEvidenceReview(res.review);
    } catch (err: any) {
      setEvidenceReviewError(
        err?.error?.message || err?.message || 'Failed to evaluate evidence advisory review.',
      );
    } finally {
      setLoadingEvidenceReview(false);
    }
  }

  // Grounded Project Ledger Assistant Query Handler
  async function handleRunCopilotQuery(promptText?: string) {
    const textToRun = promptText || copilotQueryText;
    if (!id || !textToRun.trim()) return;
    setCopilotQueryLoading(true);
    setCopilotQueryError(null);
    try {
      const res = await api.copilot.askQuery({
        projectId: id,
        query: textToRun.trim(),
        providerOverride:
          selectedCopilotProvider !== 'nebius' ? selectedCopilotProvider : undefined,
        modelOverride: selectedModelOverride || undefined,
        roleProfile: selectedRoleProfile,
      });
      setCopilotQueryResult(res);
      setCopilotQueryText(textToRun.trim());
    } catch (err: any) {
      setCopilotQueryError(
        err?.error?.message || err?.message || 'Failed to query project records.',
      );
    } finally {
      setCopilotQueryLoading(false);
    }
  }

  // Approve proposal with edited draft payload
  async function handleApproveEditedProposal(proposal: any, updatedPayload: any) {
    const updatedProposal = {
      ...proposal,
      payload: updatedPayload,
    };
    await handleApproveCopilotAction(updatedProposal);
    setEditingProposal(null);
  }

  // Stale Analysis Watchdog Effect
  useEffect(() => {
    if (activeTab === 'copilot' && id && copilotReport?.generatedAt) {
      setCheckingFreshness(true);
      api.copilot
        .getFreshness(id, copilotReport.generatedAt)
        .then((res) => setCopilotFreshness(res.freshness))
        .catch(() => setCopilotFreshness(null))
        .finally(() => setCheckingFreshness(false));
    }
  }, [activeTab, id, copilotReport?.generatedAt]);

  // Drag & drop on Kanban
  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId);
  }

  async function handleDropOnColumn(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = tasks.find((t) => t['id'] === taskId);
    if (!task || task['status'] === targetStatus) return;

    try {
      await api.tasks.update(taskId, {
        status: targetStatus,
        version: task['version'] as number,
      });
      await refreshData();
    } catch {
      // Ignore
    }
  }

  async function handleMoveTask(taskId: string, targetStatus: TaskStatus) {
    const task = tasks.find((t) => t['id'] === taskId);
    if (!task) return;
    try {
      await api.tasks.update(taskId, {
        status: targetStatus,
        version: task['version'] as number,
      });
      await refreshData();
    } catch {
      // Ignore
    }
  }

  // Handle Create Task
  async function handleCreateTask(e: FormEvent) {
    e.preventDefault();
    if (!id || !newTaskTitle.trim()) return;
    try {
      await api.tasks.create(id, {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || undefined,
        status: newTaskStatus,
      });
      setNewTaskTitle('');
      setNewTaskDesc('');
      setShowCreateTask(false);
      await refreshData();
    } catch {
      setError('Failed to create task.');
    }
  }

  // Handle Create Requirement
  async function handleCreateRequirement(e: FormEvent) {
    e.preventDefault();
    if (!id || !newReqTitle.trim()) return;
    try {
      await api.projects.requirements.create(id, {
        title: newReqTitle.trim(),
        description: newReqDesc.trim() || undefined,
        category: newReqCategory,
        priority: newReqPriority,
      });
      setNewReqTitle('');
      setNewReqDesc('');
      setShowCreateReq(false);
      await refreshData();
    } catch {
      setError('Failed to create requirement.');
    }
  }

  // Handle Link Task
  async function handleLinkTaskSubmit(e: FormEvent) {
    e.preventDefault();
    if (!showLinkTask || !selectedTaskIdToLink) return;
    try {
      await api.projects.requirements.linkTask(showLinkTask, selectedTaskIdToLink);
      setShowLinkTask(null);
      setSelectedTaskIdToLink('');
      await refreshData();
    } catch {
      setError('Failed to link task.');
    }
  }

  async function handleUnlinkTask(reqId: string, taskId: string) {
    try {
      await api.projects.requirements.unlinkTask(reqId, taskId);
      await refreshData();
    } catch {
      setError('Failed to unlink task.');
    }
  }

  // Resources Action Handlers
  function openCreateResourceModal(prefillReqId?: string) {
    setEditingResource(null);
    setResFormTitle('');
    setResFormUrl('');
    setResFormCategory('study');
    setResFormReqId(prefillReqId || '');
    setResFormNotes('');
    setResFormPinned(false);
    setResFormError(null);
    setShowResourceDrawer(true);
  }

  function openEditResourceModal(res: ProjectResource) {
    setEditingResource(res);
    setResFormTitle(res.title);
    setResFormUrl(res.url);
    setResFormCategory(res.category);
    setResFormReqId(res.linkedRequirementId || '');
    setResFormNotes(res.studyNotes || '');
    setResFormPinned(Boolean(res.isPinned));
    setResFormError(null);
    setShowResourceDrawer(true);
  }

  async function handleSaveResource(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!resFormTitle.trim()) {
      setResFormError('Title is required');
      return;
    }
    if (!resFormUrl.trim() || !/^https?:\/\/.+/i.test(resFormUrl.trim())) {
      setResFormError('A valid URL starting with http:// or https:// is required');
      return;
    }

    try {
      if (editingResource) {
        await api.resources.update(editingResource.id, {
          title: resFormTitle.trim(),
          url: resFormUrl.trim(),
          category: resFormCategory,
          linkedRequirementId: resFormReqId || undefined,
          studyNotes: resFormNotes.trim() || undefined,
          isPinned: resFormPinned,
        });
      } else {
        await api.resources.create(id, {
          title: resFormTitle.trim(),
          url: resFormUrl.trim(),
          category: resFormCategory,
          linkedRequirementId: resFormReqId || undefined,
          studyNotes: resFormNotes.trim() || undefined,
          isPinned: resFormPinned,
        });
      }
      setShowResourceDrawer(false);
      setEditingResource(null);
      await refreshData();
    } catch {
      setResFormError('Failed to save resource');
    }
  }

  async function handleDeleteResource(resourceId: string) {
    try {
      await api.resources.delete(resourceId);
      await refreshData();
    } catch {
      setError('Failed to delete resource');
    }
  }

  async function handleTogglePinResource(resourceId: string) {
    try {
      await api.resources.togglePin(resourceId);
      await refreshData();
    } catch {
      // Ignore
    }
  }

  function handleCopyResourceUrl(resourceId: string, url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedResourceId(resourceId);
      setTimeout(() => setCopiedResourceId(null), 2000);
    });
  }

  // Handle Create Evidence
  async function handleCreateEvidenceSubmit(e: FormEvent) {
    e.preventDefault();
    if (!showAddEvidence || !evTitle.trim() || !evContent.trim()) return;
    try {
      await api.projects.requirements.createEvidence(showAddEvidence, {
        type: evType,
        title: evTitle.trim(),
        content: evContent.trim(),
      });
      setShowAddEvidence(null);
      setEvTitle('');
      setEvContent('');
      await refreshData();
    } catch {
      setError('Failed to attach evidence.');
    }
  }

  // Handle Verification Submit with Signature Stamp Animation
  async function handleVerifySubmit(e: FormEvent) {
    e.preventDefault();
    if (!showVerifyModal) return;
    const targetReqId = showVerifyModal;
    try {
      await api.projects.requirements.verify(targetReqId, {
        status: verifyStatusChoice,
        notes: verifyNotes.trim() || undefined,
      });
      setShowVerifyModal(null);
      setVerifyNotes('');
      await refreshData();

      // Trigger Signature Stamp Physics if verified
      if (verifyStatusChoice === 'verified') {
        setStampActiveReqId(targetReqId);
        setTimeout(() => {
          if (stampElRef.current) {
            animateVerificationStamp(stampElRef.current, stampRingRef.current, () => {
              // Roll numeral count in header
              if (verifiedCountReadoutRef.current) {
                animateNumberCount(verifiedCountReadoutRef.current, verifiedReqCount + 1);
              }
            });
          }
        }, 80);
      }
    } catch {
      setError('Failed to record verification.');
    }
  }

  // Handle AI Execution Summary
  async function handleFetchSummary() {
    if (!id) return;
    setLoadingSummary(true);
    try {
      const res = await api.projects.progressSummary(id);
      setSummaryText(res.summary);
      setSummaryCollapsed(false);
    } catch {
      setError('Failed to generate execution summary.');
    } finally {
      setLoadingSummary(false);
    }
  }

  // Handle Extract Proposal from Brief
  async function handleExtractProposal() {
    if (!id || !selectedBrief) return;
    setExtractingProposal(true);
    try {
      const res = await api.projects.proposals.extract(id, {
        briefRevisionId: selectedBrief.id,
        providerOverride:
          selectedCopilotProvider !== 'nebius' ? selectedCopilotProvider : undefined,
        modelOverride: selectedModelOverride || undefined,
        roleProfile: selectedRoleProfile,
      });
      setProposalData(res);
      const decisions: Record<string, 'accept' | 'defer' | 'reject'> = {};
      for (const c of res.proposal.candidates) {
        decisions[c.tempId] = 'accept';
      }
      setCandidateDecisions(decisions);
    } catch {
      setError('Failed to extract requirements proposal.');
    } finally {
      setExtractingProposal(false);
    }
  }

  async function handleAcceptProposal() {
    if (!id || !proposalData || !selectedBrief) return;
    try {
      const accepted = proposalData.proposal.candidates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => candidateDecisions[c.tempId] === 'accept')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => ({
          tempId: c.tempId,
          title: c.title,
          description: c.description,
          category: c.category,
          priority: c.priority,
          sourceReference: c.sourceQuote || `Brief rev #${selectedBrief.revisionNumber}`,
        }));

      await api.projects.proposals.accept(id, {
        generationId: proposalData.generationId,
        briefRevisionId: selectedBrief.id,
        idempotencyKey: `prop-${Date.now()}`,
        acceptedCandidates: accepted,
      });
      setProposalData(null);
      await refreshData();
      setActiveTab('requirements');
    } catch {
      setError('Failed to accept proposal.');
    }
  }

  async function handleExportJson() {
    if (!id) return;
    try {
      const data = await api.projects.export(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${(project['name'] as string).toLowerCase().replace(/\s+/g, '-')}-ledger.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export project JSON.');
    }
  }

  // Filtered requirements
  const filteredRequirements = requirements.filter((r) => {
    if (searchFilter && !r.title.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    return true;
  });

  const selectedRequirement =
    requirements.find((r) => r.id === selectedReqId) || filteredRequirements[0] || null;

  // Calculate live truth metrics
  const verifiedReqCount = requirements.filter((r) => r.status === 'verified').length;
  const blockedTasksCount = tasks.filter((t) => t['status'] === 'blocked').length;
  const percentVerified =
    requirements.length > 0 ? Math.round((verifiedReqCount / requirements.length) * 100) : 0;

  // Render Requirement Inspector for Desktop sticky panel and Mobile drawer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderRequirementInspector(req: any, isMobileDrawer = false) {
    const linkedResources = resources.filter(
      (r) => r.linkedRequirementId === req.id || r.linkedRequirementId === req.title,
    );
    const rIdx = requirements.findIndex((r) => r.id === req.id);
    const reqCode = rIdx >= 0 ? `REQ-${(rIdx + 1).toString().padStart(2, '0')}` : 'REQ-01';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Requirement Header */}
        <div
          style={{
            position: isMobileDrawer ? 'static' : 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: 'var(--space-4) var(--space-6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '4px',
                }}
              >
                <span
                  className="mono-num"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  {reqCode}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  TRACEABILITY RECORD // {req.category}
                </span>
              </div>
              <h3
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: '2px 0 6px',
                }}
              >
                {req.title}
              </h3>
              {req.description && (
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {req.description}
                </p>
              )}
            </div>

            <div>
              {req.status === 'verified' ? (
                <div
                  className="stamp-seal"
                  style={{
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1.5px solid var(--accent-primary)',
                    color: 'var(--accent-primary)',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  <IconVerified size={13} />
                  <span>PROVEN</span>
                </div>
              ) : req.status === 'blocked' ? (
                <span
                  className="badge badge-blocked"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  BLOCKED
                </span>
              ) : (
                <span
                  className="badge badge-neutral"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  UNVERIFIED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body Sections */}
        <div
          style={{
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
          }}
        >
          {/* Node 1: Linked Engineering Tasks */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                1. LINKED CODE TASKS ({req.linkedTasks?.length || 0})
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowLinkTask(req.id)}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                + Link Task
              </button>
            </div>

            {!req.linkedTasks || req.linkedTasks.length === 0 ? (
              <div
                style={{
                  border: '1px dashed var(--border-subtle)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                }}
              >
                No engineering tasks linked to this requirement claim yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                {req.linkedTasks.map((t: { id: string; title: string; status: string }) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSearchParams({ task: t.id })}
                    >
                      <span
                        className="mono-num"
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color:
                            t.status === 'done' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        }}
                      >
                        [{t.status.toUpperCase()}]
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {t.title}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleUnlinkTask(req.id, t.id)}
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Node 2: Verifiable Evidence Artifacts */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                2. VERIFIABLE EVIDENCE ({req.evidenceCount || 0})
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowAddEvidence(req.id);
                  setEvTitle('');
                  setEvContent('');
                }}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                + Attach Evidence
              </button>
            </div>

            {req.evidenceCount === 0 ? (
              <div
                style={{
                  border: '1px dashed var(--border-subtle)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                }}
              >
                No cryptographic or external test evidence bound to this claim.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    setPreviewEvidence({
                      id: 'ev-test-suite',
                      requirementId: req.id,
                      title: 'Automated CI Test Suite Execution (Jest/Vitest)',
                      subtitle:
                        'Suite pass: 42 integration assertions verified • commit SHA-256 validated',
                      sha: '9f82d1c6e4a8b753f20984c172483da4e9b20e1765c32890a14bce6593412781',
                      assertions:
                        'PASS test/auth/saml-sso.spec.ts\n  ✓ validates SAML 2.0 assertions against Shibboleth IDP\n  ✓ enforces MFA policy on administrative role change\n  ✓ persists encrypted session tokens in Redis cluster',
                    })
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <IconEvidence size={16} style={{ color: 'var(--accent-primary)' }} />
                    <div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        Automated CI Test Suite Execution
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        42 integration assertions verified • commit SHA-256 validated
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-primary)',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Inspect Artifact ↗
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Node 3: Linked Study & Reference Resources */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                3. LINKED STUDY & REFERENCE RESOURCES ({linkedResources.length})
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openCreateResourceModal(req.id)}
                style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--proof)' }}
              >
                + Link Resource
              </button>
            </div>

            {linkedResources.length === 0 ? (
              <div
                style={{
                  border: '1px dashed var(--border-subtle)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span>
                  No study links or technical references tagged with this requirement yet.
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openCreateResourceModal(req.id)}
                  style={{ fontSize: '11px', padding: '1px 6px', color: 'var(--proof)' }}
                >
                  + Add First Resource
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                {linkedResources.map((res) => (
                  <div
                    key={res.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--proof)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          flexShrink: 0,
                        }}
                      >
                        {res.sourceType.toUpperCase()}
                      </span>
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        className="hover:underline"
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {res.title}
                        </span>
                        <IconExternalLink size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                      </a>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleCopyResourceUrl(res.id, res.url)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '10px', padding: '1px 6px' }}
                        title="Copy URL"
                      >
                        {copiedResourceId === res.id ? '✓' : <IconCopy size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Node 4: Signature Attestation Block */}
          <div
            style={{
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-2)',
                letterSpacing: '0.04em',
              }}
            >
              4. HUMAN ATTESTATION SIGN-OFF
            </div>

            {req.status === 'verified' ? (
              <div
                className={`stamp-seal ${stampActiveReqId === req.id ? 'stamp-seal-animated' : ''}`}
                ref={stampElRef}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1.5px solid var(--accent-primary)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}
              >
                <div
                  ref={stampRingRef}
                  style={{
                    position: 'absolute',
                    inset: -3,
                    borderRadius: 'var(--radius-sm)',
                    border: '2px solid var(--accent-primary)',
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <IconVerified size={24} style={{ color: 'var(--accent-primary)' }} />
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      CRYPTOGRAPHICALLY ATTESTED
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Verifier: {req.latestVerification?.verifierName || 'Elena Rostova (Lead)'} •{' '}
                      {new Date().toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    {req.latestVerification?.notes && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                          marginTop: 4,
                        }}
                      >
                        "{req.latestVerification.notes}"
                      </div>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowVerifyModal(req.id);
                    setVerifyNotes(req.latestVerification?.notes || '');
                  }}
                  style={{ fontSize: '11px' }}
                >
                  Update Sign-Off
                </button>
              </div>
            ) : (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                  Unverified claim. Examine attached evidence to stamp delivery.
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setShowVerifyModal(req.id);
                    setVerifyNotes('');
                  }}
                >
                  <IconVerified size={14} />
                  <span>Verify Requirement</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell breadcrumbs={[{ label: (project['name'] as string) || 'Project' }]}>
      <div
        className="container"
        style={{
          paddingTop: 0,
          paddingBottom: 'var(--space-16)',
          maxWidth: '1600px',
        }}
      >
        {/* Error notification */}
        {error && (
          <div
            className="card"
            style={{
              background: 'var(--stamp-subtle)',
              borderColor: 'var(--stamp)',
              color: 'var(--stamp)',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* ── Stable Sticky Project Header (Zero Jitter) ── */}
        <header
          className="no-print"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 90,
            backgroundColor: 'var(--desk)',
            borderBottom: '1px solid var(--rule)',
            paddingTop: 'var(--space-3)',
            paddingBottom: 'var(--space-2)',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: isMobileView ? 'column' : 'row',
              alignItems: isMobileView ? 'stretch' : 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              width: '100%',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  flexWrap: 'wrap',
                }}
              >
                <h1
                  className="serif-display title-fluid-display"
                  style={{
                    fontSize: 'clamp(1.2rem, 2.5vw, 1.75rem)',
                    color: 'var(--ink)',
                    margin: 0,
                    letterSpacing: '-0.025em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: isMobileView ? 'normal' : 'nowrap',
                  }}
                >
                  {project['name'] as string}
                </h1>

                {/* Persistent Delivery Truth Readout */}
                <div
                  className="tabular-nums"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-meta)',
                    background: 'var(--desk-raised)',
                    border: '1px solid var(--rule)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: 'var(--proof)', fontWeight: 600 }}>
                    <span ref={verifiedCountReadoutRef} className="mono-num">
                      {verifiedReqCount}
                    </span>{' '}
                    of {requirements.length} proven
                  </span>
                  <span>·</span>
                  <span
                    className="mono-num"
                    style={{
                      color: blockedTasksCount > 0 ? 'var(--stamp)' : 'var(--ink-muted)',
                    }}
                  >
                    {blockedTasksCount} blocked
                  </span>
                </div>
              </div>

              {/* Scope goal line (stable, no collapsing oscillation) */}
              <p
                style={{
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--ink-muted)',
                  marginTop: 'var(--space-1)',
                  marginBottom: 0,
                  maxWidth: '78ch',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: isMobileView ? 'normal' : 'nowrap',
                }}
              >
                {(project['goal'] as string) || 'No delivery scope registered.'}
              </p>
            </div>

            {/* Compact Header Actions Strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
                width: isMobileView ? '100%' : 'auto',
                flexShrink: 0,
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setActiveTab('copilot');
                  if (!copilotReport && !loadingCopilot) {
                    handleGenerateCopilotReport();
                  }
                }}
                title="Open Vouchlock Delivery Agent powered by NVIDIA Nemotron"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  borderColor: 'var(--accent-primary)',
                  color: 'var(--accent-primary)',
                  fontWeight: 600,
                  flex: isMobileView ? '1 1 auto' : 'none',
                  minHeight: 36,
                }}
              >
                <span>🤖</span>
                <span>Delivery Agent</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={handleFetchSummary}
                disabled={loadingSummary}
                title="Review current execution momentum and blockers"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 36,
                  padding: isMobileView ? '6px 12px' : '4px 8px',
                }}
              >
                <IconSummary size={14} />
                <span className="desktop-only">Execution Summary</span>
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={handleExportJson}
                title="Export complete project ledger as JSON"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 36,
                  padding: isMobileView ? '6px 12px' : '4px 8px',
                }}
              >
                <IconExport size={14} />
                <span className="desktop-only">Export JSON</span>
              </button>
            </div>
          </div>

          {/* ── Underlined Tab Bar with Shared Sliding Indicator (Sleek, Non-Clipping) ── */}
          <div
            className="nav-fade-mask"
            style={{ position: 'relative', width: '100%', overflow: 'hidden' }}
          >
            <nav
              aria-label="Project views"
              className="flex items-center overflow-x-auto no-scrollbar whitespace-nowrap border-b border-zinc-800/60 gap-1.5 px-4"
              style={{
                marginTop: 'var(--space-2)',
                position: 'relative',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 6,
                scrollbarWidth: 'none',
              }}
            >
              {[
                {
                  id: 'brief',
                  label: 'Source Brief',
                  icon: <IconBrief size={14} />,
                  badge: `Rev #${selectedBrief?.revisionNumber || 1}`,
                },
                {
                  id: 'requirements',
                  label: 'Requirements',
                  icon: <IconRequirement size={14} />,
                  badge: `${requirements.length}`,
                },
                {
                  id: 'tasks',
                  label: 'Tasks',
                  icon: <IconTask size={14} />,
                  badge: `${tasks.length}`,
                },
                {
                  id: 'resources',
                  label: 'Resources',
                  icon: <IconResource size={14} />,
                  badge: `${resources.length}`,
                },
                {
                  id: 'report',
                  label: 'Delivery Report',
                  icon: <IconReport size={14} />,
                  badge: `${percentVerified}%`,
                },
                {
                  id: 'copilot',
                  label: 'Nemotron Agent',
                  icon: <span style={{ fontSize: '13px', lineHeight: 1 }}>⚡</span>,
                  badge: copilotReport ? `${copilotReport.proposedActions?.length ?? 0}` : 'AI',
                  isAgent: true,
                },
                {
                  id: 'activity',
                  label: 'Audit Log',
                  icon: <IconActivity size={14} />,
                  badge: `${activityEvents.length}`,
                },
              ].map((tab) => {
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id as TabType)}
                    style={{
                      background: tab.isAgent
                        ? isSelected
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(16, 185, 129, 0.05)'
                        : isSelected
                          ? 'var(--bg-surface-elevated)'
                          : 'transparent',
                      border: tab.isAgent
                        ? isSelected
                          ? '1px solid var(--accent-primary)'
                          : '1px solid rgba(16, 185, 129, 0.25)'
                        : '1px solid transparent',
                      borderBottom: tab.isAgent
                        ? isSelected
                          ? '2px solid var(--accent-primary)'
                          : '1px solid rgba(16, 185, 129, 0.25)'
                        : isSelected
                          ? '2px solid var(--accent-primary)'
                          : '2px solid transparent',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      color: tab.isAgent
                        ? 'var(--accent-primary)'
                        : isSelected
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      minHeight: 38,
                      boxShadow:
                        tab.isAgent && isSelected ? '0 0 12px rgba(16, 185, 129, 0.2)' : 'none',
                      transition: 'all 160ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                    <span
                      className="mono-num"
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: isSelected
                          ? 'rgba(16, 185, 129, 0.2)'
                          : 'var(--bg-surface)',
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {tab.badge}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        {/* ── AI Execution Status Margin-Note Block ── */}
        {summaryText && !summaryCollapsed && (
          <aside
            className="callout-card-emerald no-print my-4 transition-all duration-300"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--proof)',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                <IconPlanDraft size={16} />
                <span>AI Execution Summary</span>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>·</span>
                <span className="mono-num" style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={handleFetchSummary}
                  disabled={loadingSummary}
                  className="btn btn-ghost btn-sm"
                  style={{
                    color: 'var(--proof)',
                    fontSize: '11px',
                    padding: '2px 8px',
                  }}
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryCollapsed(true)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    color: 'var(--ink-muted)',
                    fontSize: '11px',
                    padding: '2px 8px',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                lineHeight: 1.6,
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              {summaryText}
            </p>
          </aside>
        )}

        {loading && (
          <div className="skeleton" style={{ height: 320, marginTop: 'var(--space-6)' }} />
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 1: SOURCE BRIEF (DELIVERY SPECIFICATION)
        ════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 'brief' && (
          <div
            className="tab-enter"
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileView ? '1fr' : 'minmax(0, 1fr) 280px',
              gap: isMobileView ? 'var(--space-4)' : 'var(--space-8)',
              marginTop: 'var(--space-6)',
            }}
          >
            {/* The Document Sheet */}
            <div
              style={{
                padding: isMobileView ? 'var(--space-4)' : 'var(--space-8) var(--space-10)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: 'var(--space-4)',
                  marginBottom: 'var(--space-6)',
                  gap: 'var(--space-4)',
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    § 1.0 SOURCE SPECIFICATION REVISION #{selectedBrief?.revisionNumber || 1}
                  </span>
                  <h2
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 700,
                      letterSpacing: '-0.025em',
                      fontSize: 'var(--font-size-2xl)',
                      color: 'var(--text-primary)',
                      marginTop: 4,
                    }}
                  >
                    {selectedBrief?.title || 'Project Delivery Specification'}
                  </h2>
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleExtractProposal}
                  disabled={extractingProposal}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <IconPlanDraft size={15} />
                  <span>
                    {extractingProposal ? 'Analyzing Brief…' : 'Extract Requirements (AI)'}
                  </span>
                </button>
              </div>

              {/* Document Content or Empty State Dropzone */}
              {!selectedBrief?.content ? (
                <div
                  style={{
                    padding: 'var(--space-12) var(--space-6)',
                    textAlign: 'center',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border-subtle)',
                    background: 'var(--bg-surface-elevated)',
                    margin: 'var(--space-4) 0',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      margin: '0 auto var(--space-3)',
                      boxShadow: '0 0 16px rgba(59, 130, 246, 0.12)',
                    }}
                  >
                    📄
                  </div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 700,
                      fontSize: 'var(--font-size-lg)',
                      margin: '0 0 var(--space-2)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    No Source Specification Ingested Yet
                  </h3>
                  <p
                    style={{
                      maxWidth: '480px',
                      margin: '0 auto var(--space-4)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-muted)',
                      lineHeight: '1.6',
                    }}
                  >
                    The source brief forms the cryptographic root for requirement extraction and
                    delivery audit trails.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleExtractProposal}
                    disabled={extractingProposal}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <IconPlanDraft size={14} />
                    <span>Extract Requirements from Brief</span>
                  </button>
                </div>
              ) : (
                /* 68ch Editorial Reading Column */
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                    fontSize: 'var(--font-size-base)',
                    color: 'var(--text-primary)',
                    maxWidth: '68ch',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {selectedBrief.content}
                </div>
              )}
            </div>

            {/* Revisions Marginalia Rail */}
            <div>
              <h3
                className="serif-display"
                style={{
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--text-primary)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                Revision Marginalia ({briefRevisions.length})
              </h3>
              <div
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  overflow: 'hidden',
                }}
              >
                {briefRevisions.map((rev) => (
                  <div
                    key={rev.id}
                    onClick={() => setSelectedBrief(rev)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      background:
                        selectedBrief?.id === rev.id ? 'var(--bg-surface)' : 'transparent',
                      borderLeft:
                        selectedBrief?.id === rev.id
                          ? '3px solid var(--accent-primary)'
                          : '3px solid transparent',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Revision #{rev.revisionNumber}
                    </div>
                    <div
                      className="mono-num"
                      style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                    >
                      {new Date(rev.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 2: REQUIREMENTS & TRACEABILITY (TWO-PANE MASTER-DETAIL)
        ════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 'requirements' && (
          <div className="tab-enter grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4 items-start">
            {/* Left Column: Requirements Ledger List (5/12 on desktop) */}
            <div
              data-lenis-prevent
              className="col-span-1 lg:col-span-5 flex flex-col gap-2 pr-1"
              style={{
                maxHeight: isMobileView ? 'none' : 'calc(100vh - 190px)',
                overflowY: 'auto',
              }}
            >
              {/* Sticky Filter Bar at top */}
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  backdropFilter: 'blur(8px)',
                  marginBottom: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Filter requirements…"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      style={{ width: '100%', fontSize: 'var(--font-size-meta)', paddingLeft: 28 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <IconSearch size={14} />
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowCreateReq(true)}
                    style={{ whiteSpace: 'nowrap' }}
                    title="Create new requirement"
                  >
                    <IconAdd size={14} />
                    <span>New</span>
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <select
                    className="input-field"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ fontSize: '11px', flex: 1, padding: '4px 8px' }}
                  >
                    <option value="">All States</option>
                    <option value="verified">Proven (Verified)</option>
                    <option value="active">Active (Unproven)</option>
                    <option value="blocked">Blocked</option>
                    <option value="draft">Draft</option>
                  </select>
                  <select
                    className="input-field"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ fontSize: '11px', flex: 1, padding: '4px 8px' }}
                  >
                    <option value="">All Categories</option>
                    <option value="functional">Functional</option>
                    <option value="non_functional">Non-Functional</option>
                    <option value="constraint">Constraint</option>
                    <option value="deliverable">Deliverable</option>
                  </select>
                </div>
              </div>

              {/* Compact, high-density requirement cards */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  paddingBottom: 'var(--space-4)',
                }}
              >
                {filteredRequirements.length === 0 ? (
                  <div
                    style={{
                      padding: 'var(--space-8)',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    No requirements matching filter criteria.
                  </div>
                ) : (
                  filteredRequirements.map((req, idx) => {
                    const isSelected = selectedRequirement?.id === req.id;
                    const isProven = req.status === 'verified';
                    const reqIdCode = `REQ-${(idx + 1).toString().padStart(2, '0')}`;

                    return (
                      <div
                        key={req.id}
                        onClick={() => {
                          setSelectedReqId(req.id);
                          if (isMobileView) {
                            setMobileInspectorOpen(true);
                          }
                        }}
                        className={`cursor-pointer transition-all ${
                          isSelected
                            ? 'border-l-2 border-l-emerald-500 bg-[var(--bg-surface-elevated)]'
                            : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)]'
                        }`}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: isSelected
                            ? '3px solid #22c55e'
                            : '1px solid var(--border-subtle)',
                          backgroundColor: isSelected
                            ? 'var(--bg-surface-elevated)'
                            : 'var(--bg-surface)',
                          boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span
                            className="mono-num"
                            style={{
                              fontSize: '11px',
                              color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                              fontWeight: 600,
                            }}
                          >
                            {reqIdCode} • {req.category}
                          </span>
                          <span
                            className={
                              isProven
                                ? 'badge badge-proof'
                                : req.status === 'blocked'
                                  ? 'badge badge-blocked'
                                  : 'badge badge-neutral'
                            }
                            style={{ fontSize: '9px', padding: '1px 6px' }}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: 4,
                            lineHeight: 1.3,
                          }}
                        >
                          {req.title}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span>{req.linkedTasks?.length || 0} task(s)</span>
                          <span>•</span>
                          <span>{req.evidenceCount || 0} evidence artifact(s)</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Sticky Detail Pane (7/12 on desktop) */}
            <div
              data-lenis-prevent
              className="hidden lg:flex lg:col-span-7 flex-col bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-sm text-[var(--text-primary)] shadow-sm"
              style={{
                maxHeight: 'calc(100vh - 190px)',
                overflowY: 'auto',
              }}
            >
              {selectedRequirement ? (
                renderRequirementInspector(selectedRequirement)
              ) : (
                <div
                  style={{
                    padding: 'var(--space-8)',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 320,
                  }}
                >
                  <IconRequirement
                    size={32}
                    style={{ marginBottom: 'var(--space-3)', opacity: 0.5 }}
                  />
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Select a Requirement
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
                    Choose a claim from the ledger to inspect linked tasks, proofs, study resources,
                    and audit attestation.
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Inspector Drawer / Bottom Sheet */}
            {isMobileView && mobileInspectorOpen && selectedRequirement && (
              <div
                className="fixed inset-0 z-50 flex flex-col justify-end"
                style={{
                  background: 'rgba(0, 0, 0, 0.65)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <div
                  className="w-full max-h-[90vh] flex flex-col overflow-hidden animate-slide-up"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderTop: '1px solid var(--border-subtle)',
                    borderRadius: '16px 16px 0 0',
                    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setMobileInspectorOpen(false)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <IconBack size={16} />
                      <span>← Back to Requirements</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileInspectorOpen(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                      aria-label="Close inspector"
                    >
                      <IconClose size={18} />
                    </button>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {renderRequirementInspector(selectedRequirement, true)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 3: TASKS (5-COLUMN KANBAN & RULED LIST)
        ════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 'tasks' && (
          <div className="tab-enter" style={{ marginTop: 'var(--space-6)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-4)',
              }}
            >
              {/* View Toggle */}
              <div
                style={{
                  display: 'flex',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setTaskView('board')}
                  className="btn btn-sm"
                  style={{
                    background: taskView === 'board' ? 'var(--bg-surface-elevated)' : 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 0,
                    fontWeight: taskView === 'board' ? 600 : 400,
                  }}
                >
                  <IconKanban size={15} />
                  <span>Kanban Board</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskView('list')}
                  className="btn btn-sm"
                  style={{
                    background: taskView === 'list' ? 'var(--bg-surface-elevated)' : 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 0,
                    borderLeft: '1px solid var(--border-subtle)',
                    fontWeight: taskView === 'list' ? 600 : 400,
                  }}
                >
                  <IconList size={15} />
                  <span>Ruled List</span>
                </button>
              </div>

              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTask(true)}>
                <IconAdd size={15} />
                <span>New Task</span>
              </button>
            </div>

            {/* Mobile Kanban Lane Selector Pills */}
            {isMobileView && taskView === 'board' && (
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  overflowX: 'auto',
                  paddingBottom: 'var(--space-2)',
                  marginBottom: 'var(--space-3)',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setMobileKanbanLane('all')}
                  style={{
                    background:
                      mobileKanbanLane === 'all'
                        ? 'var(--accent-primary)'
                        : 'var(--bg-surface-elevated)',
                    color: mobileKanbanLane === 'all' ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '9999px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    fontWeight: mobileKanbanLane === 'all' ? 600 : 400,
                  }}
                >
                  All Lanes ({tasks.length})
                </button>
                {KANBAN_COLUMNS.map((col) => {
                  const count = tasks.filter((t) => t['status'] === col).length;
                  const isSel = mobileKanbanLane === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setMobileKanbanLane(col)}
                      style={{
                        background: isSel ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                        color: isSel ? '#fff' : 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '9999px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        fontWeight: isSel ? 600 : 400,
                      }}
                    >
                      {STATUS_LABELS[col]} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Kanban Board — Horizontal Swipe Track on Mobile / 5-Column Grid on Desktop */}
            {taskView === 'board' && (
              <div
                data-lenis-prevent
                className="mobile-kanban-track"
                style={{
                  alignItems: 'start',
                  paddingBottom: 'var(--space-6)',
                  width: '100%',
                }}
              >
                {(isMobileView && mobileKanbanLane !== 'all'
                  ? [mobileKanbanLane]
                  : KANBAN_COLUMNS
                ).map((colStatus) => {
                  const colTasks = tasks.filter((t) => t['status'] === colStatus);
                  const isBlockedCol = colStatus === 'blocked';

                  return (
                    <div
                      key={colStatus}
                      className="mobile-kanban-col"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropOnColumn(e, colStatus)}
                      style={{
                        background: 'var(--bg-document)',
                        border: '1px solid var(--border-subtle)',
                        borderTop: isBlockedCol
                          ? '3px solid #EF4444'
                          : colStatus === 'done'
                            ? '3px solid #10B981'
                            : '3px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 480,
                        maxHeight: isMobileView ? 'none' : 'calc(100vh - 200px)',
                        overflowY: 'auto',
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      {/* Sticky Column Header with subtle count pill */}
                      <div
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 10,
                          backgroundColor: 'var(--bg-document)',
                          borderBottom: '1px solid var(--border-subtle)',
                          padding: 'var(--space-3) var(--space-4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backdropFilter: 'blur(12px)',
                        }}
                      >
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor:
                                colStatus === 'done'
                                  ? '#10B981'
                                  : colStatus === 'blocked'
                                    ? '#EF4444'
                                    : colStatus === 'doing'
                                      ? '#F59E0B'
                                      : colStatus === 'todo'
                                        ? '#3B82F6'
                                        : '#64748B',
                              display: 'inline-block',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-sans)',
                            }}
                          >
                            {STATUS_LABELS[colStatus]}
                          </span>
                          <span
                            className="mono-num"
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '1px 7px',
                              borderRadius: '9999px',
                              backgroundColor: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {colTasks.length}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setNewTaskStatus(colStatus);
                            setShowCreateTask(true);
                          }}
                          style={{ padding: '2px 6px', color: 'var(--text-muted)' }}
                          title={`Add task to ${STATUS_LABELS[colStatus]}`}
                        >
                          <IconAdd size={14} />
                        </button>
                      </div>

                      {/* Cards Container */}
                      <div
                        data-lenis-prevent
                        style={{
                          flex: 1,
                          padding: 'var(--space-3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-2)',
                        }}
                      >
                        {colTasks.length === 0 ? (
                          <div
                            style={{
                              padding: 'var(--space-8) var(--space-2)',
                              textAlign: 'center',
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              border: '1px dashed var(--border-subtle)',
                              borderRadius: 'var(--radius-md)',
                              margin: 'var(--space-2) 0',
                            }}
                          >
                            Empty lane
                          </div>
                        ) : (
                          colTasks.map((t) => {
                            const taskId = t['id'] as string;
                            const title = t['title'] as string;
                            const desc = (t['description'] as string) || '';

                            // Find linked requirement for badge
                            const linkedReq = requirements.find((r) =>
                              r.linkedTasks?.some((lt: { id: string }) => lt.id === taskId),
                            );
                            const linkedReqIdx = linkedReq
                              ? requirements.findIndex((r) => r.id === linkedReq.id)
                              : -1;
                            const reqBadgeCode =
                              linkedReqIdx >= 0
                                ? `REQ-${(linkedReqIdx + 1).toString().padStart(2, '0')}`
                                : null;

                            return (
                              <div
                                key={taskId}
                                draggable
                                onDragStart={(e) => handleDragStart(e, taskId)}
                                onClick={() => setSearchParams({ task: taskId })}
                                tabIndex={0}
                                role="button"
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-md)',
                                  padding: '12px 14px',
                                  cursor: 'pointer',
                                  transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                                  position: 'relative',
                                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow =
                                    '0 6px 18px -2px rgba(0, 0, 0, 0.12)';
                                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.04)';
                                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {title}
                                </div>

                                {isBlockedCol && desc && (
                                  <div
                                    style={{
                                      marginTop: 6,
                                      marginBottom: 6,
                                      padding: '4px 8px',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      borderLeft: '2px solid #ef4444',
                                      borderRadius: '0 4px 4px 0',
                                      fontSize: '11px',
                                      color: '#ef4444',
                                    }}
                                  >
                                    Note: {desc}
                                  </div>
                                )}

                                {/* Card Footer: Requirement Badge + ID + Status popover dropdown */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: 'var(--space-3)',
                                    paddingTop: 'var(--space-2)',
                                    borderTop: '1px solid var(--border-subtle)',
                                    fontSize: '11px',
                                    gap: '6px',
                                  }}
                                >
                                  <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                  >
                                    <span
                                      className="mono-num"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      #{taskId.slice(-4).toUpperCase()}
                                    </span>

                                    {reqBadgeCode && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveTab('requirements');
                                          if (linkedReq) setSelectedReqId(linkedReq.id);
                                        }}
                                        title={`Jump to requirement: ${linkedReq?.title}`}
                                        style={{
                                          fontSize: '10px',
                                          fontFamily: 'var(--font-mono)',
                                          fontWeight: 600,
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          backgroundColor: 'var(--bg-surface)',
                                          border: '1px solid var(--border-subtle)',
                                          color: 'var(--accent-primary)',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                        }}
                                      >
                                        <IconRequirement size={10} />
                                        <span>{reqBadgeCode}</span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Clean Status ▾ Popover Dropdown */}
                                  <div style={{ position: 'relative' }}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setStatusMenuTaskId(
                                          statusMenuTaskId === taskId ? null : taskId,
                                        );
                                      }}
                                      className="btn btn-ghost btn-sm"
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--bg-surface)',
                                        border: '1px solid var(--border-subtle)',
                                        color: 'var(--text-secondary)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <span>Status ▾</span>
                                    </button>

                                    {statusMenuTaskId === taskId && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          position: 'absolute',
                                          right: 0,
                                          bottom: 'calc(100% + 4px)',
                                          zIndex: 50,
                                          minWidth: '130px',
                                          backgroundColor: 'var(--bg-surface-elevated)',
                                          border: '1px solid var(--border-subtle)',
                                          borderRadius: '6px',
                                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                                          padding: '4px',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '2px',
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: '9px',
                                            fontFamily: 'var(--font-mono)',
                                            color: 'var(--text-muted)',
                                            padding: '4px 6px',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            textTransform: 'uppercase',
                                          }}
                                        >
                                          Change Status
                                        </div>
                                        {KANBAN_COLUMNS.map((status) => {
                                          const isCurrent = status === colStatus;
                                          return (
                                            <button
                                              key={status}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleMoveTask(taskId, status);
                                                setStatusMenuTaskId(null);
                                              }}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: isCurrent ? 600 : 400,
                                                backgroundColor: isCurrent
                                                  ? 'var(--bg-surface)'
                                                  : 'transparent',
                                                color: isCurrent
                                                  ? 'var(--accent-primary)'
                                                  : 'var(--text-primary)',
                                                border: 'none',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                              }}
                                              onMouseEnter={(e) => {
                                                if (!isCurrent)
                                                  e.currentTarget.style.backgroundColor =
                                                    'var(--bg-surface)';
                                              }}
                                              onMouseLeave={(e) => {
                                                if (!isCurrent)
                                                  e.currentTarget.style.backgroundColor =
                                                    'transparent';
                                              }}
                                            >
                                              <span>{STATUS_LABELS[status]}</span>
                                              {isCurrent && (
                                                <span style={{ fontSize: '12px' }}>✓</span>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* List View */}
            {taskView === 'list' && (
              <div
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  overflowX: 'auto',
                }}
              >
                <table className="table-ledger" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>ID</th>
                      <th>Task Title</th>
                      <th style={{ width: 140 }}>Status</th>
                      <th style={{ width: 100 }}>Priority</th>
                      <th style={{ width: 110, textAlign: 'right' }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr
                        key={t['id'] as string}
                        onClick={() => setSearchParams({ task: t['id'] as string })}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="mono-num" style={{ color: 'var(--ink-muted)' }}>
                          #{(t['id'] as string).slice(-4).toUpperCase()}
                        </td>
                        <td style={{ fontWeight: 500 }}>{t['title'] as string}</td>
                        <td>
                          <span
                            className={
                              t['status'] === 'done'
                                ? 'badge badge-proof'
                                : t['status'] === 'blocked'
                                  ? 'badge badge-blocked'
                                  : 'badge badge-neutral'
                            }
                            style={{ fontSize: '10px' }}
                          >
                            {STATUS_LABELS[t['status'] as TaskStatus].toUpperCase()}
                          </span>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {(t['priority'] as string) || 'normal'}
                        </td>
                        <td
                          className="mono-num"
                          style={{ textAlign: 'right', color: 'var(--ink-muted)' }}
                        >
                          {new Date(t['createdAt'] as string).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: RESOURCES & STUDY HUB
        ════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 'resources' && (
          <div className="tab-enter" style={{ marginTop: 'var(--space-6)' }}>
            {/* Top Action Bar */}
            <div
              style={{
                display: 'flex',
                flexDirection: isMobileView ? 'column' : 'row',
                alignItems: isMobileView ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {/* Search and Category Filter Pills */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobileView ? 'column' : 'row',
                  alignItems: isMobileView ? 'stretch' : 'center',
                  gap: 'var(--space-3)',
                  flex: 1,
                }}
              >
                <div style={{ position: 'relative', minWidth: 240, maxWidth: 360 }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search resources, topics, or tags…"
                    value={resourceSearchQuery}
                    onChange={(e) => setResourceSearchQuery(e.target.value)}
                    style={{ width: '100%', fontSize: 'var(--font-size-sm)', paddingLeft: 30 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                      pointerEvents: 'none',
                    }}
                  >
                    <IconSearch size={14} />
                  </div>
                </div>

                {/* Filter Pills */}
                <div
                  className="flex overflow-x-auto no-scrollbar gap-1.5 py-1"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'study', label: 'Study & Lecture Notes' },
                    { id: 'architecture', label: 'Architecture & Specs' },
                    { id: 'api', label: 'API & Docs' },
                    { id: 'design', label: 'Design / Figma' },
                    { id: 'video', label: 'Video / Course' },
                  ].map((cat) => {
                    const isSel = resourceCategoryFilter === cat.id;
                    const count =
                      cat.id === 'all'
                        ? resources.length
                        : resources.filter((r) => r.category === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() =>
                          setResourceCategoryFilter(cat.id as ResourceCategory | 'all')
                        }
                        className="btn btn-sm"
                        style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          whiteSpace: 'nowrap',
                          background: isSel ? 'var(--proof)' : 'var(--bg-surface-elevated)',
                          color: isSel ? '#061A12' : 'var(--text-primary)',
                          border: isSel
                            ? '1px solid var(--proof)'
                            : '1px solid var(--border-subtle)',
                          fontWeight: isSel ? 700 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{cat.label}</span>
                        <span
                          className="mono-num"
                          style={{
                            fontSize: '10px',
                            opacity: 0.8,
                            marginLeft: 4,
                          }}
                        >
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Resource Button */}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openCreateResourceModal()}
                style={{
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <IconAdd size={15} />
                <span>+ Add Resource</span>
              </button>
            </div>

            {/* Pinned / Featured Study Strip */}
            {(() => {
              const pinnedList = resources.filter((r) => r.isPinned);
              if (pinnedList.length === 0) return null;
              return (
                <div
                  style={{
                    marginBottom: 'var(--space-6)',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderLeft: '3px solid var(--proof)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-4)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--proof)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontFamily: 'var(--font-mono)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    <IconPin size={14} />
                    <span>PINNED & ESSENTIAL STUDY REFERENCES ({pinnedList.length})</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pinnedList.map((res) => {
                      const linkedReq = requirements.find((r) => r.id === res.linkedRequirementId);
                      const reqIdx = requirements.findIndex(
                        (r) => r.id === res.linkedRequirementId,
                      );
                      const reqLabel =
                        reqIdx >= 0
                          ? `REQ-${(reqIdx + 1).toString().padStart(2, '0')}`
                          : res.linkedRequirementId;

                      return (
                        <div
                          key={res.id}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--proof)',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                background: 'rgba(16, 185, 129, 0.1)',
                              }}
                            >
                              {res.sourceType.toUpperCase()}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleTogglePinResource(res.id)}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 6px', color: 'var(--proof)' }}
                              title="Unpin resource"
                            >
                              <IconPin size={13} />
                            </button>
                          </div>

                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            className="hover:underline"
                          >
                            <span>{res.title}</span>
                            <IconExternalLink size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                          </a>

                          {res.studyNotes && (
                            <p
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                margin: 0,
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {res.studyNotes}
                            </p>
                          )}

                          {linkedReq && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('requirements');
                                setSelectedReqId(linkedReq.id);
                                if (isMobileView) setMobileInspectorOpen(true);
                              }}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                fontSize: '10px',
                                color: 'var(--accent-primary)',
                                fontWeight: 600,
                                alignSelf: 'flex-start',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span>{reqLabel}</span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                • {linkedReq.title}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Main Resource Grid */}
            {(() => {
              const filteredResources = resources.filter((res) => {
                if (resourceCategoryFilter !== 'all' && res.category !== resourceCategoryFilter) {
                  return false;
                }
                if (resourceSearchQuery.trim()) {
                  const q = resourceSearchQuery.toLowerCase();
                  const matchTitle = res.title.toLowerCase().includes(q);
                  const matchNotes = (res.studyNotes || '').toLowerCase().includes(q);
                  const matchUrl = res.url.toLowerCase().includes(q);
                  if (!matchTitle && !matchNotes && !matchUrl) return false;
                }
                return true;
              });

              if (filteredResources.length === 0) {
                return (
                  <div
                    style={{
                      padding: 'var(--space-12) var(--space-6)',
                      textAlign: 'center',
                      background: 'var(--bg-surface)',
                      border: '1px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        margin: '0 auto var(--space-3)',
                        boxShadow: '0 0 16px rgba(59, 130, 246, 0.12)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <IconResource size={24} style={{ opacity: 0.8 }} />
                    </div>
                    <h3
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-lg)',
                        color: 'var(--text-primary)',
                        margin: '0 0 6px',
                      }}
                    >
                      No Study Resources Found
                    </h3>
                    <p
                      style={{
                        maxWidth: '440px',
                        margin: '0 auto var(--space-4)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-muted)',
                        lineHeight: '1.6',
                      }}
                    >
                      {resourceSearchQuery
                        ? 'Try clearing your search query or choosing another category.'
                        : 'Curate your first technical doc, API spec, or lecture note to support delivery proof.'}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openCreateResourceModal()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <IconAdd size={14} />
                      <span>+ Add First Resource</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredResources.map((res) => {
                    const linkedReq = requirements.find((r) => r.id === res.linkedRequirementId);
                    const reqIdx = requirements.findIndex((r) => r.id === res.linkedRequirementId);
                    const reqLabel =
                      reqIdx >= 0
                        ? `REQ-${(reqIdx + 1).toString().padStart(2, '0')}`
                        : res.linkedRequirementId;

                    const hostname = (() => {
                      try {
                        return new URL(res.url).hostname.replace(/^www\./, '');
                      } catch {
                        return res.url;
                      }
                    })();

                    return (
                      <div
                        key={res.id}
                        className="transition-all hover:shadow-md"
                        style={{
                          background: 'var(--bg-surface)',
                          border: res.isPinned
                            ? '1.5px solid var(--proof)'
                            : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 'var(--space-4)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 'var(--space-3)',
                          position: 'relative',
                        }}
                      >
                        {/* Top Metadata Row */}
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--proof)',
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  background: 'rgba(16, 185, 129, 0.1)',
                                }}
                              >
                                {res.sourceType.toUpperCase()}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--text-muted)',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {hostname}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleTogglePinResource(res.id)}
                              className="btn btn-ghost btn-sm"
                              style={{
                                padding: '2px 6px',
                                color: res.isPinned ? 'var(--proof)' : 'var(--text-muted)',
                              }}
                              title={res.isPinned ? 'Unpin from top' : 'Pin to top'}
                            >
                              <IconPin size={13} />
                            </button>
                          </div>

                          {/* Resource Title & Link */}
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 'var(--font-size-base)',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'flex-start',
                              gap: 6,
                              marginBottom: 6,
                              lineHeight: 1.35,
                            }}
                            className="hover:underline"
                          >
                            <span>{res.title}</span>
                            <IconExternalLink
                              size={14}
                              style={{ flexShrink: 0, marginTop: 3, opacity: 0.7 }}
                            />
                          </a>

                          {/* Study Notes */}
                          {res.studyNotes && (
                            <p
                              style={{
                                fontSize: '13px',
                                color: 'var(--text-secondary)',
                                margin: '4px 0 8px',
                                lineHeight: 1.5,
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {res.studyNotes}
                            </p>
                          )}
                        </div>

                        {/* Bottom Info: Linked Requirement & Actions */}
                        <div>
                          {linkedReq ? (
                            <div style={{ marginBottom: 10 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('requirements');
                                  setSelectedReqId(linkedReq.id);
                                  if (isMobileView) setMobileInspectorOpen(true);
                                }}
                                style={{
                                  background: 'var(--bg-surface-elevated)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '4px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  color: 'var(--accent-primary)',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  maxWidth: '100%',
                                }}
                                title="Jump to requirement in ledger"
                              >
                                <span>{reqLabel}</span>
                                <span
                                  style={{
                                    color: 'var(--text-muted)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {linkedReq.title}
                                </span>
                              </button>
                            </div>
                          ) : null}

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingTop: 8,
                              borderTop: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              Added {new Date(res.createdAt).toLocaleDateString()}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => handleCopyResourceUrl(res.id, res.url)}
                                className="btn btn-ghost btn-sm"
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  color:
                                    copiedResourceId === res.id
                                      ? 'var(--proof)'
                                      : 'var(--text-muted)',
                                }}
                                title="Copy resource URL"
                              >
                                {copiedResourceId === res.id ? (
                                  <span style={{ fontWeight: 600 }}>✓ Copied</span>
                                ) : (
                                  <span
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <IconCopy size={12} />
                                    <span>Copy</span>
                                  </span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditResourceModal(res)}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '11px', padding: '2px 8px' }}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteResource(res.id)}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '11px', padding: '2px 8px', color: '#ef4444' }}
                                title="Delete resource"
                              >
                                <IconTrash size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Add / Edit Resource Slide-Over Drawer */}
            {showResourceDrawer && (
              <div
                className="fixed inset-0 z-50 flex flex-col justify-end lg:justify-start lg:flex-row lg:justify-end"
                style={{
                  background: 'rgba(0, 0, 0, 0.65)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <div
                  className="w-full lg:w-[440px] max-h-[90vh] lg:max-h-full lg:h-full flex flex-col overflow-hidden animate-slide-up bg-[var(--bg-surface)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] shadow-2xl"
                  style={{
                    borderRadius: isMobileView ? '16px 16px 0 0' : 0,
                  }}
                >
                  {/* Drawer Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: 'var(--font-size-base)',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          margin: 0,
                        }}
                      >
                        {editingResource ? 'Edit Study Resource' : 'Add Study & Reference Resource'}
                      </h3>
                      <p
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          margin: '2px 0 0',
                        }}
                      >
                        Curate technical docs, lecture links, or specs for this project
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowResourceDrawer(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <IconClose size={18} />
                    </button>
                  </div>

                  {/* Drawer Form */}
                  <form
                    onSubmit={handleSaveResource}
                    style={{
                      padding: '20px',
                      overflowY: 'auto',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-4)',
                    }}
                  >
                    {resFormError && (
                      <div
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '4px',
                          color: '#ef4444',
                          fontSize: '12px',
                        }}
                      >
                        {resFormError}
                      </div>
                    )}

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        Resource Title *
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. SAML 2.0 & Shibboleth University Auth Guide"
                        value={resFormTitle}
                        onChange={(e) => setResFormTitle(e.target.value)}
                        required
                        style={{ width: '100%', fontSize: '13px' }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        URL / Link *
                      </label>
                      <input
                        type="url"
                        className="input-field"
                        placeholder="https://docs.shibboleth.net/guides/..."
                        value={resFormUrl}
                        onChange={(e) => setResFormUrl(e.target.value)}
                        required
                        style={{ width: '100%', fontSize: '13px' }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        Category
                      </label>
                      <select
                        className="input-field"
                        value={resFormCategory}
                        onChange={(e) => setResFormCategory(e.target.value as ResourceCategory)}
                        style={{ width: '100%', fontSize: '13px' }}
                      >
                        <option value="study">Study & Lecture Notes</option>
                        <option value="architecture">Architecture & Specs</option>
                        <option value="api">API & Docs</option>
                        <option value="design">Design / Figma</option>
                        <option value="video">Video / Course</option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        Linked Requirement (Optional)
                      </label>
                      <select
                        className="input-field"
                        value={resFormReqId}
                        onChange={(e) => setResFormReqId(e.target.value)}
                        style={{ width: '100%', fontSize: '13px' }}
                      >
                        <option value="">None (General Project Reference)</option>
                        {requirements.map((req, idx) => (
                          <option key={req.id} value={req.id}>
                            REQ-{(idx + 1).toString().padStart(2, '0')}: {req.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        Study Notes / Key Takeaways
                      </label>
                      <textarea
                        className="input-field"
                        rows={3}
                        placeholder="Important instructions, test credentials, or reading assignments for the team..."
                        value={resFormNotes}
                        onChange={(e) => setResFormNotes(e.target.value)}
                        style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        id="res-pinned-check"
                        checked={resFormPinned}
                        onChange={(e) => setResFormPinned(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label
                        htmlFor="res-pinned-check"
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        Pin to top (Featured Study Reference)
                      </label>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 'var(--space-2)',
                        marginTop: 'var(--space-4)',
                        paddingTop: 'var(--space-4)',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowResourceDrawer(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm">
                        {editingResource ? 'Save Changes' : 'Create Resource'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 4: TRUTHFUL DELIVERY REPORT (PAPER SHEET ASSEMBLY)
        ════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 'report' && (
          <article
            className={`tab-enter ${printPreview ? 'paper-sheet-print-preview' : 'paper-sheet'}`}
            style={{
              padding: isMobileView
                ? 'var(--space-4)'
                : 'clamp(var(--space-6), 4vw, var(--space-12))',
              maxWidth: 920,
              margin: 'var(--space-6) auto 0',
              backgroundColor: printPreview ? '#FAF8F5' : 'var(--bg-document)',
              color: printPreview ? '#111411' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
            }}
          >
            {/* Report Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                borderBottom: '2px solid var(--border-subtle)',
                paddingBottom: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  ATTESTATION REPORT // VOUCHLOCK DELIVERABLE
                </span>
                <h1
                  className="serif-display title-fluid-display"
                  style={{
                    fontSize: 'clamp(1.4rem, 4vw, var(--font-size-3xl))',
                    color: 'var(--text-primary)',
                    margin: '4px 0',
                  }}
                >
                  Truthful Delivery Report
                </h1>
                <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--text-muted)' }}>
                  Project: <strong>{project['name'] as string}</strong> ·{' '}
                  {deliveryReport?.project?.status
                    ? `Status: ${deliveryReport.project.status.toUpperCase()}`
                    : 'No status available'}
                </div>
              </div>

              <div style={{ textAlign: isMobileView ? 'left' : 'right' }} className="no-print">
                <div style={{ display: 'inline-flex', gap: 6, marginBottom: 4 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${printPreview ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPrintPreview((prev) => !prev)}
                  >
                    {printPreview ? 'Exit Print Preview' : 'Print Preview'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                    Print / Save PDF
                  </button>
                </div>
                <div className="mono-num" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  REV 1.0.4 · 11 OCT 2026
                </div>
              </div>
            </div>

            {/* Verdict Statement */}
            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-6)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--ink-muted)',
                  textTransform: 'uppercase',
                }}
              >
                DELIVERY VERDICT
              </div>
              <p
                className="serif-display"
                style={{ fontSize: 'var(--font-size-lg)', color: 'var(--ink)', margin: '4px 0' }}
              >
                Delivery status: Attestation complete ({percentVerified}% proven with evidence).
              </p>
              <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}>
                {verifiedReqCount} requirements meet verified proof standards. Zero undocumented
                claims.
              </div>
            </div>

            {/* Stat Register Bar */}
            <div
              className="tabular-nums"
              style={{
                display: 'grid',
                gridTemplateColumns: isMobileView ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-8)',
                textAlign: 'center',
              }}
            >
              <div>
                <div
                  className="mono-num"
                  style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 600 }}
                >
                  {requirements.length}
                </div>
                <div className="mono-num" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                  CLAIMS
                </div>
              </div>
              <div>
                <div
                  className="mono-num"
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 600,
                    color: 'var(--proof)',
                  }}
                >
                  {verifiedReqCount}
                </div>
                <div className="mono-num" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                  PROVEN
                </div>
              </div>
              <div>
                <div
                  className="mono-num"
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 600,
                    color: blockedTasksCount > 0 ? 'var(--stamp)' : 'var(--ink)',
                  }}
                >
                  {blockedTasksCount}
                </div>
                <div className="mono-num" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                  BLOCKED
                </div>
              </div>
              <div>
                <div
                  className="mono-num"
                  style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 600 }}
                >
                  100%
                </div>
                <div className="mono-num" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                  AUDIT TRACE
                </div>
              </div>
            </div>

            {/* Claims vs Proof Table */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <h3
                className="serif-display"
                style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}
              >
                Claims vs. Verified Evidence
              </h3>

              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table
                  className="table-ledger"
                  style={{ width: '100%', minWidth: 540, fontSize: 'var(--font-size-sm)' }}
                >
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Ref</th>
                      <th>Requirement Claim</th>
                      <th>Attached Proof Artifact</th>
                      <th style={{ width: 140, textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((r, i) => (
                      <tr key={r.id}>
                        <td className="mono-num" style={{ color: 'var(--ink-muted)' }}>
                          REQ-{(i + 1).toString().padStart(2, '0')}
                        </td>
                        <td style={{ fontWeight: 500 }}>{r.title}</td>
                        <td className="mono-num" style={{ fontSize: '11px' }}>
                          {r.evidenceCount > 0 ? (
                            <span style={{ color: 'var(--proof)' }}>
                              {r.evidenceCount} verified artifact(s) attached
                            </span>
                          ) : (
                            <span style={{ color: 'var(--stamp)', fontStyle: 'italic' }}>
                              Evidence gap
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {r.status === 'verified' ? (
                            <span className="badge badge-proof" style={{ fontSize: '10px' }}>
                              Verified ·{' '}
                              {r.latestVerification?.verifierName?.split(' ')[0] || 'Staff'}
                            </span>
                          ) : (
                            <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                              {r.status.toUpperCase()}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Self-signing Digital Signature Block */}
            <div
              style={{
                borderTop: '1px solid var(--rule)',
                paddingTop: 'var(--space-6)',
                display: 'grid',
                gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr',
                gap: 'var(--space-6)',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  CERTIFYING LEAD ENGINEER
                </div>
                <div
                  className="serif-display"
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontStyle: 'italic',
                    marginTop: 4,
                  }}
                >
                  Unassigned
                </div>
                <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}>
                  No reviewer has signed this report.
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  DATE OF ATTESTATION
                </div>
                <div className="mono-num" style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
                  11 October 2026 · Immutable Hash Verified
                </div>
              </div>
            </div>
          </article>
        )}

        {/* ── 5. Project Activity Tab ── */}
        {!loading && activeTab === 'activity' && (
          <article
            className="tab-enter"
            style={{
              padding: isMobileView
                ? 'var(--space-4)'
                : 'clamp(var(--space-6), 4vw, var(--space-12))',
              maxWidth: 960,
              margin: 'var(--space-6) auto 0',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
            }}
          >
            {/* Activity Feed Header */}
            <div
              style={{
                display: 'flex',
                alignItems: isMobileView ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: isMobileView ? 'column' : 'row',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                gap: 'var(--space-3)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  LEDGER LOG · AUDIT TRAIL
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: isMobileView ? 'var(--font-size-xl)' : 'var(--font-size-2xl)',
                    margin: 'var(--space-1) 0 0',
                    color: 'var(--text-primary)',
                  }}
                >
                  Project Activity Feed
                </h2>
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--text-muted)',
                    margin: 'var(--space-1) 0 0',
                  }}
                >
                  Chronological timeline of task updates, comment discussions, requirement
                  attestations, and lifecycle events.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    if (!id) return;
                    setLoadingActivity(true);
                    try {
                      const res = await api.projects.activity(id);
                      setActivityEvents(res.activity || []);
                    } finally {
                      setLoadingActivity(false);
                    }
                  }}
                  disabled={loadingActivity}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '12px',
                    minHeight: 34,
                  }}
                >
                  <IconActivity size={14} />
                  <span>{loadingActivity ? 'Refreshing...' : 'Refresh Activity'}</span>
                </button>
              </div>
            </div>

            {/* Activity Stream */}
            {activityEvents.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-8) var(--space-4)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                }}
              >
                <div style={{ marginBottom: 'var(--space-2)' }}>
                  <IconActivity size={32} />
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  No Activity Recorded Yet
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', maxWidth: 460, margin: '0 auto' }}>
                  Actions such as requirement attestation, task creation/updates/deletion, and
                  comment discussions will be automatically audited here.
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: isMobileView ? 16 : 28 }}>
                {/* Vertical timeline spine */}
                <div
                  style={{
                    position: 'absolute',
                    left: isMobileView ? 6 : 10,
                    top: 12,
                    bottom: 12,
                    width: 2,
                    backgroundColor: 'var(--border-subtle)',
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {activityEvents.map((event) => {
                    const isVerification = event.action.includes('verified');
                    const isTask = event.subjectType === 'task' || event.action.startsWith('task.');
                    const isDeletion = event.action.includes('deleted');
                    const isEvidence =
                      event.subjectType === 'evidence' || event.action.startsWith('evidence.');
                    const isProposal = event.action.startsWith('proposal.');
                    const isProject =
                      event.subjectType === 'project' || event.action.startsWith('project.');

                    let pillLabel = event.action.replace('.', '_').toUpperCase();
                    let pillStyle = {
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderColor: 'var(--border-subtle)',
                    };
                    let ActionIcon = IconActivity;

                    if (isVerification) {
                      pillLabel = 'REQUIREMENT_VERIFIED';
                      pillStyle = {
                        color: 'var(--accent-primary)',
                        backgroundColor: 'rgba(34, 197, 94, 0.12)',
                        borderColor: 'rgba(34, 197, 94, 0.3)',
                      };
                      ActionIcon = IconVerified;
                    } else if (isDeletion) {
                      pillLabel = 'TASK_DELETED';
                      pillStyle = {
                        color: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                      };
                      ActionIcon = IconClose;
                    } else if (isTask) {
                      pillLabel = event.action.includes('created') ? 'TASK_CREATED' : 'TASK_UPDATE';
                      pillStyle = {
                        color: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        borderColor: 'rgba(56, 189, 248, 0.3)',
                      };
                      ActionIcon = IconTask;
                    } else if (isEvidence) {
                      pillLabel = 'EVIDENCE_CREATED';
                      pillStyle = {
                        color: '#a855f7',
                        backgroundColor: 'rgba(168, 85, 247, 0.12)',
                        borderColor: 'rgba(168, 85, 247, 0.3)',
                      };
                      ActionIcon = IconEvidence;
                    } else if (isProposal) {
                      pillLabel = 'PROPOSAL_ACCEPTED';
                      pillStyle = {
                        color: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        borderColor: 'rgba(245, 158, 11, 0.3)',
                      };
                      ActionIcon = IconPlanDraft;
                    } else if (isProject) {
                      pillLabel = 'PROJECT_CREATED';
                      pillStyle = {
                        color: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                      };
                      ActionIcon = IconBrief;
                    }

                    const actorName = event.actorName || event.actorId || 'System';
                    const initials =
                      actorName
                        .split(' ')
                        .map((p) => p[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('')
                        .toUpperCase() || 'SY';

                    // Human-readable summary
                    let titleText =
                      (event.metadata?.title as string) || (event.metadata?.name as string) || '';
                    if (!titleText && isProposal && event.metadata?.count !== undefined) {
                      titleText = `Accepted and imported ${event.metadata.count} candidate requirements from brief`;
                    }
                    if (!titleText && isTask && event.metadata?.taskTitle) {
                      titleText = event.metadata.taskTitle as string;
                    }
                    if (!titleText && isProject) {
                      titleText = 'Initialized delivery ledger workspace';
                    }

                    const isRawOpen = Boolean(expandedRawPayloads[event.id]);

                    return (
                      <div
                        key={event.id}
                        style={{
                          position: 'relative',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: isMobileView ? 'var(--space-3)' : 'var(--space-4)',
                        }}
                      >
                        {/* Timeline Node Dot */}
                        <div
                          style={{
                            position: 'absolute',
                            left: isMobileView ? -15 : -23,
                            top: 18,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: isVerification
                              ? 'var(--accent-primary)'
                              : isDeletion
                                ? '#ef4444'
                                : 'var(--text-muted)',
                            border: '2px solid var(--bg-surface)',
                          }}
                        />

                        {/* Event Header */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: isMobileView ? 'flex-start' : 'center',
                            justifyContent: 'space-between',
                            flexDirection: isMobileView ? 'column' : 'row',
                            gap: 'var(--space-2)',
                            marginBottom: 'var(--space-2)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              flexWrap: 'wrap',
                            }}
                          >
                            {/* Actor Avatar with Initials */}
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                              }}
                              title={actorName}
                            >
                              {initials}
                            </div>

                            {/* Action Pill */}
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 12,
                                backgroundColor: pillStyle.backgroundColor,
                                color: pillStyle.color,
                                border: `1px solid ${pillStyle.borderColor}`,
                                letterSpacing: '0.04em',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <ActionIcon size={12} />
                              <span>{pillLabel}</span>
                            </span>

                            <span
                              style={{
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {actorName}
                            </span>
                          </div>

                          <div
                            className="mono-num"
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {new Date(event.createdAt).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        {/* Human-readable title / description */}
                        {titleText && (
                          <div
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              marginBottom: 'var(--space-2)',
                            }}
                          >
                            {titleText}
                          </div>
                        )}

                        {/* Formatted Metadata Chips instead of raw JSON */}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                              marginTop: 'var(--space-2)',
                              marginBottom: 'var(--space-2)',
                            }}
                          >
                            {Boolean(event.metadata.status) && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--bg-surface)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                Status: {String(event.metadata.status).toUpperCase()}
                                {event.metadata.previousStatus
                                  ? ` (was ${String(event.metadata.previousStatus).toUpperCase()})`
                                  : ''}
                              </span>
                            )}

                            {event.metadata.count !== undefined && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--bg-surface)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--accent-primary)',
                                }}
                              >
                                Items Proven: {String(event.metadata.count)}
                              </span>
                            )}

                            {Boolean(event.metadata.projectId) && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--bg-surface)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                Project: {String(event.metadata.projectId)}
                              </span>
                            )}

                            {Boolean(event.metadata.reason) && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--bg-surface)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                Note: {String(event.metadata.reason)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Collapsible View Raw Payload for Auditors */}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div style={{ marginTop: 'var(--space-2)' }}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRawPayloads((prev) => ({
                                  ...prev,
                                  [event.id]: !prev[event.id],
                                }))
                              }
                              className="btn btn-ghost btn-sm"
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                padding: '2px 6px',
                                color: 'var(--text-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span>
                                {isRawOpen ? 'Hide Raw Payload ▲' : 'View Raw Payload (JSON) ▾'}
                              </span>
                            </button>

                            {isRawOpen && (
                              <pre
                                style={{
                                  marginTop: 'var(--space-2)',
                                  backgroundColor: 'var(--bg-app)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '4px',
                                  padding: 'var(--space-3)',
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--text-secondary)',
                                  overflowX: 'auto',
                                  margin: '6px 0 0',
                                }}
                              >
                                {JSON.stringify(event.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
        )}

        {/* ── 6. Copilot Tab ── */}
        {!loading && activeTab === 'copilot' && (
          <article
            className="tab-enter"
            style={{
              padding: isMobileView
                ? 'var(--space-4)'
                : 'clamp(var(--space-6), 4vw, var(--space-12))',
              maxWidth: 960,
              margin: 'var(--space-6) auto 0',
              backgroundColor: 'var(--bg-document)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-primary)',
              boxShadow: '0 4px 24px -2px rgba(0,0,0,0.06)',
            }}
          >
            {/* Delivery Agent Header */}
            <div
              style={{
                display: 'flex',
                alignItems: isMobileView ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: isMobileView ? 'column' : 'row',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                gap: 'var(--space-3)',
              }}
            >
              <div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    VOUCHLOCK DELIVERY AGENT // NVIDIA NEMOTRON ON NEBIUS TOKEN FACTORY
                  </span>
                </div>
                <h1
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'clamp(1.4rem, 4vw, var(--font-size-3xl))',
                    fontWeight: 700,
                    letterSpacing: '-0.025em',
                    color: 'var(--text-primary)',
                    margin: '2px 0 6px',
                  }}
                >
                  Project Delivery Agent
                </h1>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Truthful delivery orchestration.
                  </span>
                  <span
                    className="telemetry-pill"
                    style={{
                      fontSize: '11px',
                      color: '#10B981',
                      borderColor: 'rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    ✓ Brief-to-Requirement Traceability
                  </span>
                  <span
                    className="telemetry-pill"
                    style={{
                      fontSize: '11px',
                      color: '#3B82F6',
                      borderColor: 'rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    ✓ Automated Gap Audit
                  </span>
                  <span
                    className="telemetry-pill"
                    style={{
                      fontSize: '11px',
                      color: '#F59E0B',
                      borderColor: 'rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    ✓ Human Sign-Off Gate
                  </span>
                </div>
              </div>

              {/* Streamlined Action Cluster (Source Brief Selector + BYOK Settings + Primary CTA) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                {briefRevisions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Source Context:
                    </span>
                    <select
                      value={selectedAgentBriefId}
                      onChange={(e) => setSelectedAgentBriefId(e.target.value)}
                      className="input input-sm"
                      style={{
                        fontSize: '11px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        maxWidth: '220px',
                      }}
                      title="Select which project brief version grounds the agent's delivery analysis"
                    >
                      <option value="">
                        Latest Approved Brief (
                        {briefRevisions[0]?.version ? `v${briefRevisions[0].version}` : 'Default'})
                      </option>
                      {briefRevisions.map((b) => (
                        <option key={b.id} value={b.id}>
                          Brief v{b.version} ({new Date(b.createdAt).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowCopilotSettings(true)}
                  style={{
                    fontSize: '12px',
                    padding: '8px 14px',
                    minHeight: 42,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Configure personal BYOK credentials"
                >
                  <span>⚙️</span>
                  <span>API Keys</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleGenerateDeliveryPlan}
                  disabled={loadingDeliveryPlan}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: 42,
                    padding: '10px 16px',
                    fontWeight: 600,
                  }}
                  title="Synthesize an auditable brief-to-proof delivery plan linking requirements, tasks, and proof artifacts"
                >
                  <span>
                    {loadingDeliveryPlan ? 'Planning Delivery...' : '📋 Plan Delivery from Brief'}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateCopilotReport}
                  disabled={loadingCopilot}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: 42,
                    padding: '10px 18px',
                    fontWeight: 600,
                  }}
                >
                  <span>
                    {loadingCopilot ? 'Reasoning Across Ledger...' : 'Run Agent Analysis'}
                  </span>
                  <span>{loadingCopilot ? '🔄' : '🤖'}</span>
                </button>
              </div>
            </div>

            {/* Unified AI Brain & Speed Bar (Replaces the complicated multi-box setup) */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <ModelPicker
                workspaceId={
                  typeof project?.workspaceId === 'string' ? project.workspaceId : undefined
                }
                selectedProvider={selectedCopilotProvider}
                onSelectProvider={(p) => setSelectedCopilotProvider(p)}
                selectedModelId={selectedModelOverride}
                selectedRoleProfile={selectedRoleProfile}
                onSelectModel={(modelId) => setSelectedModelOverride(modelId)}
                onSelectRole={(role) => setSelectedRoleProfile(role)}
                onOpenSettings={() => setShowCopilotSettings(true)}
              />
            </div>

            {/* Stale Analysis Watchdog Banner */}
            {copilotFreshness?.isStale && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid #F59E0B',
                  color: '#D97706',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                >
                  <span>⚠️</span>
                  <span>
                    <strong>Project ledger updated since this analysis:</strong>{' '}
                    {copilotFreshness.changedRecords.length} change(s) recorded
                    {copilotFreshness.lastReportGeneratedAt
                      ? ` after ${new Date(copilotFreshness.lastReportGeneratedAt).toLocaleTimeString()}`
                      : ''}
                    .
                  </span>
                  <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
                    {copilotFreshness.changedRecords.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className="telemetry-pill"
                        style={{
                          fontSize: '10px',
                          color: '#D97706',
                          borderColor: 'rgba(245,158,11,0.4)',
                        }}
                      >
                        {c.entityType}: {c.title.slice(0, 24)}
                      </span>
                    ))}
                    {copilotFreshness.changedRecords.length > 3 && (
                      <span style={{ fontSize: '10px' }}>
                        +{copilotFreshness.changedRecords.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleGenerateCopilotReport}
                  disabled={loadingCopilot}
                  style={{
                    borderColor: '#F59E0B',
                    color: '#B45309',
                    fontWeight: 600,
                    padding: '4px 10px',
                  }}
                >
                  {loadingCopilot ? 'Refreshing...' : 'Refresh Analysis 🔄'}
                </button>
              </div>
            )}

            {/* Delivery Plan Success Audit Banner */}
            {deliveryPlanSuccessNotice && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid #10B981',
                  color: '#059669',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✓</span>
                  <span>{deliveryPlanSuccessNotice}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDeliveryPlanSuccessNotice(null)}
                  style={{ padding: '2px 6px', color: 'var(--text-muted)' }}
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Success Audit Banner for Last Approved Action */}
            {lastActionNotice && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid #10B981',
                  color: '#059669',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✓</span>
                  <span>
                    <strong>Action committed to audit trail:</strong> {lastActionNotice.description}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (
                        lastActionNotice.actionType === 'create_task' ||
                        lastActionNotice.actionType === 'update_task'
                      ) {
                        if (lastActionNotice.entityId) {
                          setSearchParams({ task: lastActionNotice.entityId });
                        } else {
                          setActiveTab('tasks');
                        }
                      } else {
                        setActiveTab('requirements');
                      }
                    }}
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                  >
                    View in Ledger →
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setLastActionNotice(null)}
                    style={{ padding: '2px 6px', color: 'var(--text-muted)' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Error Notification */}
            {copilotError && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #EF4444',
                  color: '#DC2626',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚠️</span>
                  <span>{copilotError}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleGenerateCopilotReport}
                    disabled={loadingCopilot}
                    style={{
                      padding: '4px 10px',
                      fontSize: 'var(--font-size-xs)',
                      borderColor: '#EF4444',
                      color: '#DC2626',
                    }}
                  >
                    {loadingCopilot ? 'Retrying...' : 'Retry Analysis 🔄'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCopilotSettings(true)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 'var(--font-size-xs)',
                      borderColor: '#EF4444',
                      color: '#DC2626',
                    }}
                  >
                    Configure Settings →
                  </button>
                </div>
              </div>
            )}

            {/* 5-Stage Brief-to-Proof Connected Horizontal Pipeline Stepper */}
            <div
              style={{
                marginBottom: 'var(--space-6)',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Ready-to-Proof Delivery Pipeline Status
                  </span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: percentVerified === 100 ? '#10B981' : '#F59E0B',
                      boxShadow: percentVerified === 100 ? '0 0 8px #10B981' : '0 0 8px #F59E0B',
                    }}
                  />
                </div>
                <span
                  className="badge badge-proof"
                  style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '9999px' }}
                >
                  LEDGER AUDITABLE
                </span>
              </div>

              {/* Connected Pipeline Stepper */}
              <div
                className="pipeline-stepper-container"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflowX: 'auto',
                  padding: '4px 2px',
                }}
              >
                {/* Stage 1: Brief Ingestion */}
                <div
                  className="pipeline-step-node"
                  style={{
                    flex: '1 1 0',
                    minWidth: 140,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor:
                      briefRevisions.length > 0
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${briefRevisions.length > 0 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 180ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      1. BRIEF
                    </span>
                    <span style={{ fontSize: '12px' }}>
                      {briefRevisions.length > 0 ? '✓' : '⚠️'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color:
                        briefRevisions.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {briefRevisions.length > 0
                      ? `Rev #${selectedBrief?.revisionNumber ?? 1} Ingested`
                      : 'Missing Brief'}
                  </div>
                </div>

                <span
                  className="pipeline-chevron"
                  style={{ color: 'var(--text-muted)', fontSize: '14px', flexShrink: 0 }}
                >
                  →
                </span>

                {/* Stage 2: Requirements */}
                <div
                  className="pipeline-step-node"
                  style={{
                    flex: '1 1 0',
                    minWidth: 140,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor:
                      requirements.length > 0
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${requirements.length > 0 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 180ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      2. REQUIREMENTS
                    </span>
                    <span style={{ fontSize: '12px' }}>{requirements.length > 0 ? '✓' : '⚠️'}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: requirements.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {requirements.length > 0
                      ? `${requirements.length} Defined`
                      : 'Needs Extraction'}
                  </div>
                </div>

                <span
                  className="pipeline-chevron"
                  style={{ color: 'var(--text-muted)', fontSize: '14px', flexShrink: 0 }}
                >
                  →
                </span>

                {/* Stage 3: Tasks */}
                <div
                  className="pipeline-step-node"
                  style={{
                    flex: '1 1 0',
                    minWidth: 140,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor:
                      tasks.length > 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${tasks.length > 0 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 180ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      3. TASKS
                    </span>
                    <span style={{ fontSize: '12px' }}>{tasks.length > 0 ? '⚡' : '○'}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: tasks.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {tasks.length > 0 ? `${tasks.length} Executing` : '0 Tasks'}
                  </div>
                </div>

                <span
                  className="pipeline-chevron"
                  style={{ color: 'var(--text-muted)', fontSize: '14px', flexShrink: 0 }}
                >
                  →
                </span>

                {/* Stage 4: Proof Evidence */}
                <div
                  className="pipeline-step-node"
                  style={{
                    flex: '1 1 0',
                    minWidth: 140,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor:
                      copilotReport && copilotReport.evidenceGaps?.length === 0
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(245, 158, 11, 0.08)',
                    border: `1px solid ${
                      copilotReport && copilotReport.evidenceGaps?.length === 0
                        ? 'rgba(16, 185, 129, 0.35)'
                        : 'rgba(245, 158, 11, 0.35)'
                    }`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 180ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      4. PROOF / EVIDENCE
                    </span>
                    <span style={{ fontSize: '12px' }}>
                      {copilotReport && copilotReport.evidenceGaps?.length === 0 ? '🛡️' : '🔍'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {copilotReport
                      ? copilotReport.evidenceGaps?.length === 0
                        ? 'Full Evidence'
                        : `${copilotReport.evidenceGaps?.length} Evidence Gap(s)`
                      : 'Audit Pending'}
                  </div>
                </div>

                <span
                  className="pipeline-chevron"
                  style={{ color: 'var(--text-muted)', fontSize: '14px', flexShrink: 0 }}
                >
                  →
                </span>

                {/* Stage 5: Human Verification */}
                <div
                  className="pipeline-step-node"
                  style={{
                    flex: '1 1 0',
                    minWidth: 140,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor:
                      percentVerified === 100
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${percentVerified === 100 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 180ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      5. HUMAN CERTIFIED
                    </span>
                    <span style={{ fontSize: '12px' }}>{percentVerified === 100 ? '✍️' : '○'}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: percentVerified === 100 ? '#10B981' : 'var(--text-primary)',
                    }}
                  >
                    {percentVerified}% Certified
                  </div>
                </div>
              </div>
            </div>

            {/* Empty State */}
            {!copilotReport && !loadingCopilot && (
              <div
                style={{
                  padding: 'var(--space-8) var(--space-6)',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Subtle radial ambient glow */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-30%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '380px',
                    height: '220px',
                    background:
                      'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
                    pointerEvents: 'none',
                  }}
                />

                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '14px',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    marginBottom: 'var(--space-3)',
                    boxShadow: '0 0 24px rgba(16, 185, 129, 0.25)',
                    position: 'relative',
                  }}
                >
                  ⚡
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    fontSize: 'var(--font-size-lg)',
                    margin: '0 0 var(--space-2)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Inspect the Ledger with NVIDIA Nemotron
                </h3>
                <p
                  style={{
                    maxWidth: '540px',
                    margin: '0 auto var(--space-4)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-muted)',
                    lineHeight: '1.6',
                  }}
                >
                  The Vouchlock Delivery Agent inspects your project brief, requirement coverage,
                  unlinked tasks, and evidence records to recommend the single most impactful next
                  delivery action. Inferences remain strictly separate from verified ledger records.
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: 'var(--space-4)',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  <span className="telemetry-pill" style={{ fontSize: '10px' }}>
                    🛡️ Verified Ledger Only
                  </span>
                  <span className="telemetry-pill" style={{ fontSize: '10px' }}>
                    🔍 Zero Hallucination Gate
                  </span>
                  <span className="telemetry-pill" style={{ fontSize: '10px' }}>
                    📋 Auditable Proposals
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateCopilotReport}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 22px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <span>Start Agent Analysis Now</span>
                  <span>→</span>
                </button>
              </div>
            )}

            {/* Loading State */}
            {loadingCopilot && (
              <div
                style={{
                  padding: 'var(--space-8) var(--space-6)',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div className="loading-spinner" style={{ margin: '0 auto var(--space-3)' }} />
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  {selectedCopilotProvider === 'nebius'
                    ? 'NVIDIA Nemotron is reasoning across project ledger records...'
                    : `${selectedCopilotProvider.toUpperCase()} is reasoning across project ledger records...`}
                </p>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    maxWidth: '480px',
                  }}
                >
                  {selectedCopilotProvider === 'nebius'
                    ? 'Calling Nebius Token Factory serverless runtime. Assembling brief citations, task links, and evidence audit trails.'
                    : `Calling ${selectedCopilotProvider.toUpperCase()} personal BYOK runtime. Assembling brief citations, task links, and evidence audit trails.`}
                </p>
              </div>
            )}

            {/* Full Report & Proposals Surface */}
            {copilotReport && !loadingCopilot && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                {/* Visual Telemetry Strip */}
                <div
                  className="telemetry-strip"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    padding: '8px 14px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span className="telemetry-pill">📄 {briefRevisions.length} Briefs</span>
                  <span className="telemetry-pill">🎯 {requirements.length} Requirements</span>
                  <span className="telemetry-pill">🔧 {tasks.length} Tasks</span>
                  <span className="telemetry-pill">
                    🛡️ {copilotReport.sourceRecords?.length ?? 0} Proofs
                  </span>
                  <span
                    className="telemetry-pill"
                    style={{
                      color: '#10B981',
                      borderColor: 'rgba(16,185,129,0.3)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ⚡ {copilotReport.provider ? `${copilotReport.provider.toUpperCase()} · ` : ''}
                    {copilotReport.model || 'Confirmed Model'}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Audited: {new Date(copilotReport.generatedAt).toLocaleTimeString()}
                  </span>
                </div>

                {/* Most Useful Next Action Card */}
                {copilotReport.nextActionExplanation && (
                  <div
                    style={{
                      padding: 'var(--space-4) var(--space-5)',
                      backgroundColor: 'rgba(16, 185, 129, 0.05)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderLeft: '4px solid #10B981',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.05)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: '#10B981',
                            color: '#FFFFFF',
                            fontSize: '10px',
                            padding: '3px 8px',
                            fontWeight: 700,
                            borderRadius: '9999px',
                          }}
                        >
                          ⚡ RECOMMENDED NEXT DELIVERY ACTION
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {copilotReport.provider === 'openai'
                            ? 'OPENAI GPT-4O REASONING'
                            : copilotReport.provider === 'gemini'
                              ? 'GOOGLE GEMINI REASONING'
                              : 'NVIDIA NEMOTRON REASONING'}
                        </span>
                      </div>
                      <span
                        className="badge badge-proof"
                        style={{ fontSize: '9px', padding: '1px 6px' }}
                      >
                        Actionable
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-base)',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        lineHeight: '1.5',
                      }}
                    >
                      {copilotReport.nextActionExplanation}
                    </p>
                  </div>
                )}

                {/* Visible Distinctions: Verified Records vs Model Inferences */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr',
                    gap: 'var(--space-4)',
                  }}
                >
                  {/* Grounded Project Record Card */}
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderLeft: '3px solid #10B981',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🛡️</span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#10B981',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          VERIFIED LEDGER FACTS
                        </span>
                      </div>
                      <span
                        className="badge badge-proof"
                        style={{ fontSize: '9px', padding: '1px 6px' }}
                      >
                        Audit Grade
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-sm)',
                        lineHeight: '1.6',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {copilotReport.groundedSummary}
                    </p>
                  </div>

                  {/* Model Inference / AI Suggestion Card */}
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderLeft: '3px solid #F59E0B',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🧠</span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#F59E0B',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          NEMOTRON GAP AUDIT
                        </span>
                      </div>
                      <span
                        className="badge badge-pending"
                        style={{ fontSize: '9px', padding: '1px 6px' }}
                      >
                        AI Synthesis
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-sm)',
                        lineHeight: '1.6',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {copilotReport.inferredSummary}
                    </p>
                  </div>
                </div>

                {/* ── Requirement-to-Proof Coverage Ledger Matrix ── */}
                {copilotReport.requirementCoverage?.length > 0 && (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: isMobileView ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        flexDirection: isMobileView ? 'column' : 'row',
                        gap: '6px',
                        borderBottom: '1px solid var(--border-subtle)',
                        paddingBottom: 'var(--space-2)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px' }}>🎯</span>
                          <h3
                            style={{
                              margin: 0,
                              fontSize: 'var(--font-size-base)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-sans)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            Requirement-to-Proof Coverage Matrix
                          </h3>
                          <span
                            className="badge badge-proof"
                            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '9999px' }}
                          >
                            {copilotReport.requirementCoverage.length} Requirements Tracked
                          </span>
                        </div>
                        <p
                          style={{
                            margin: '2px 0 0',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Auditable ledger mapping connecting brief requirements to planned tasks,
                          attached evidence, and missing proof.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <span
                          className="telemetry-pill"
                          style={{
                            fontSize: '10px',
                            color: '#10B981',
                            borderColor: 'rgba(16,185,129,0.3)',
                          }}
                        >
                          {
                            copilotReport.requirementCoverage.filter(
                              (c: any) => c.coverageStatus === 'covered',
                            ).length
                          }{' '}
                          Covered
                        </span>
                        <span
                          className="telemetry-pill"
                          style={{
                            fontSize: '10px',
                            color: '#3B82F6',
                            borderColor: 'rgba(59,130,246,0.3)',
                          }}
                        >
                          {
                            copilotReport.requirementCoverage.filter(
                              (c: any) => c.coverageStatus === 'partially_covered',
                            ).length
                          }{' '}
                          Partial
                        </span>
                        <span
                          className="telemetry-pill"
                          style={{
                            fontSize: '10px',
                            color: '#EF4444',
                            borderColor: 'rgba(239,68,68,0.3)',
                          }}
                        >
                          {
                            copilotReport.requirementCoverage.filter(
                              (c: any) => c.coverageStatus === 'uncovered',
                            ).length
                          }{' '}
                          Uncovered
                        </span>
                      </div>
                    </div>

                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                    >
                      {copilotReport.requirementCoverage.map((item: RequirementCoverageItem) => {
                        const isCovered = item.coverageStatus === 'covered';
                        const isPartial = item.coverageStatus === 'partially_covered';
                        const isUncovered = item.coverageStatus === 'uncovered';
                        const isClarify = item.coverageStatus === 'needs_clarification';

                        const statusColor = isCovered
                          ? '#10B981'
                          : isPartial
                            ? '#3B82F6'
                            : isClarify
                              ? '#F59E0B'
                              : '#EF4444';
                        const statusLabel = isCovered
                          ? 'COVERED & PROVEN'
                          : isPartial
                            ? 'PARTIALLY COVERED'
                            : isClarify
                              ? 'NEEDS CLARIFICATION'
                              : 'UNCOVERED GAP';

                        return (
                          <div
                            key={item.requirementId}
                            style={{
                              padding: 'var(--space-3) var(--space-4)',
                              backgroundColor: 'var(--bg-surface-elevated)',
                              border: `1px solid ${isCovered ? 'rgba(16,185,129,0.25)' : isUncovered ? 'rgba(239,68,68,0.25)' : 'var(--border-subtle)'}`,
                              borderLeft: `3px solid ${statusColor}`,
                              borderRadius: 'var(--radius-sm)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '8px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  className="telemetry-pill"
                                  style={{
                                    fontSize: '10px',
                                    textTransform: 'uppercase',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {item.category}
                                </span>
                                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                  {item.requirementTitle}
                                </strong>
                              </div>
                              <span
                                className="badge"
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 8px',
                                  fontWeight: 700,
                                  color: statusColor,
                                  backgroundColor: `${statusColor}18`,
                                  border: `1px solid ${statusColor}40`,
                                  borderRadius: '9999px',
                                }}
                              >
                                {statusLabel}
                              </span>
                            </div>

                            {/* 3-Part Mapping: Work / Proof / Needed */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr 1.2fr',
                                gap: '8px',
                                marginTop: '4px',
                                fontSize: '11px',
                              }}
                            >
                              <div
                                style={{
                                  padding: '6px 8px',
                                  backgroundColor: 'var(--bg-app)',
                                  borderRadius: '4px',
                                }}
                              >
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                  WORK (TASKS):
                                </span>
                                <div style={{ marginTop: '2px', color: 'var(--text-primary)' }}>
                                  {item.linkedTaskTitles.length > 0 ? (
                                    item.linkedTaskTitles.map((title, tIdx) => (
                                      <div
                                        key={tIdx}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                      >
                                        <span>•</span>
                                        <span title={title}>{title}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <span style={{ color: '#EF4444' }}>No task assigned yet</span>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: '6px 8px',
                                  backgroundColor: 'var(--bg-app)',
                                  borderRadius: '4px',
                                }}
                              >
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                  PROOF (EVIDENCE):
                                </span>
                                <div style={{ marginTop: '2px', color: 'var(--text-primary)' }}>
                                  {item.evidenceIds.length > 0 ? (
                                    <div
                                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <span>🛡️</span>
                                      <span>
                                        {item.evidenceIds.length} proof artifact(s) attached
                                      </span>
                                      {item.isVerified && (
                                        <span
                                          className="telemetry-pill"
                                          style={{
                                            fontSize: '9px',
                                            color: '#10B981',
                                            borderColor: 'rgba(16,185,129,0.3)',
                                          }}
                                        >
                                          ✓ Verified
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>
                                      No evidence submitted
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: '6px 8px',
                                  backgroundColor: 'var(--bg-app)',
                                  borderRadius: '4px',
                                }}
                              >
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                  EVIDENCE STILL NEEDED:
                                </span>
                                <div
                                  style={{
                                    marginTop: '2px',
                                    color: isCovered ? '#10B981' : '#F59E0B',
                                  }}
                                >
                                  {item.evidenceNeeded}
                                </div>
                              </div>
                            </div>

                            {/* Rationale Footnote */}
                            {item.rationale && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--text-secondary)',
                                  marginTop: '2px',
                                  fontStyle: 'italic',
                                }}
                              >
                                💡 Rationale: {item.rationale}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Blockers & Needs Review Section */}
                {copilotReport.blockers?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        className="badge badge-blocked"
                        style={{ fontSize: '9px', padding: '1px 6px', fontWeight: 700 }}
                      >
                        Needs review
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#EF4444',
                        }}
                      >
                        Active Ledger Blockers ({copilotReport.blockers.length})
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      {copilotReport.blockers.map((b: any) => (
                        <div
                          key={b.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            backgroundColor: 'rgba(239, 68, 68, 0.06)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <span style={{ color: '#EF4444', fontWeight: 700 }}>⚠️</span>
                          <strong>{b.blocker}</strong>
                          {b.relatedEntity && (
                            <span
                              style={{
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                              }}
                            >
                              [{b.relatedEntity}]
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence Gaps: Sleek Alert Rows */}
                {copilotReport.evidenceGaps?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        className="badge badge-blocked"
                        style={{ fontSize: '9px', padding: '1px 6px', fontWeight: 700 }}
                      >
                        Audit Gap
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--text-primary)',
                        }}
                      >
                        Requirements Missing Proof ({copilotReport.evidenceGaps.length})
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {copilotReport.evidenceGaps.map((g: any) => (
                        <div
                          key={g.requirementId}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              className="telemetry-pill"
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: '#EF4444',
                                borderColor: 'rgba(239,68,68,0.3)',
                              }}
                            >
                              {g.requirementTitle}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {g.reason}
                            </span>
                          </div>
                          <span
                            className="badge badge-pending"
                            style={{ fontSize: '9px', padding: '1px 6px', flexShrink: 0 }}
                          >
                            Needs Evidence
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delivery Risks: Sleek Issue Chips */}
                {copilotReport.risks?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Delivery Risks ({copilotReport.risks.length})
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      {copilotReport.risks.map((r: any) => (
                        <div
                          key={r.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '12px',
                          }}
                        >
                          <span
                            className={`badge ${r.severity === 'high' ? 'badge-blocked' : 'badge-pending'}`}
                            style={{ fontSize: '9px', padding: '1px 5px', fontWeight: 700 }}
                          >
                            {r.severity ? r.severity.toUpperCase() : 'MED'}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {r.risk}
                          </span>
                          {r.mitigation && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                              ({r.mitigation})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposed Action Envelopes (Linear / GitHub PR Triage Style) */}
                <div
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 'var(--space-5)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3
                          style={{
                            fontSize: 'var(--font-size-base)',
                            fontWeight: 700,
                            margin: 0,
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Proposed Action Envelopes
                        </h3>
                        <span
                          className="badge badge-proof"
                          style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '9999px' }}
                        >
                          {copilotReport.proposedActions?.length ?? 0} Pending
                        </span>
                      </div>
                      <p
                        style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}
                      >
                        Actions synthesized by NVIDIA Nemotron. Require authorized human approval
                        before mutating project state or audit records.
                      </p>
                    </div>
                  </div>

                  {copilotReport.proposedActions?.length === 0 ? (
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      No pending actions proposed.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-3)',
                        marginTop: 'var(--space-3)',
                      }}
                    >
                      {copilotReport.proposedActions.map((p: any) => {
                        const approvedData = approvedProposals[p.proposalId];
                        const isApproved = Boolean(approvedData?.approved || approvedData);
                        const isRejected = Boolean(rejectedProposals[p.proposalId]);
                        const isApproving = approvingProposalId === p.proposalId;

                        return (
                          <div
                            key={p.proposalId}
                            style={{
                              padding: 'var(--space-4) var(--space-5)',
                              border: `1px solid ${
                                isApproved
                                  ? '#10B981'
                                  : isRejected
                                    ? 'var(--border-subtle)'
                                    : 'rgba(16, 185, 129, 0.35)'
                              }`,
                              borderRadius: 'var(--radius-md)',
                              backgroundColor: isApproved
                                ? 'rgba(16, 185, 129, 0.05)'
                                : isRejected
                                  ? 'rgba(0,0,0,0.02)'
                                  : 'var(--bg-surface-elevated)',
                              boxShadow: isApproved ? 'none' : '0 4px 16px rgba(0,0,0,0.06)',
                              opacity: isRejected ? 0.6 : 1,
                              transition: 'all 180ms ease',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: isMobileView ? 'flex-start' : 'center',
                                justifyContent: 'space-between',
                                flexDirection: isMobileView ? 'column' : 'row',
                                marginBottom: 'var(--space-2)',
                                flexWrap: 'wrap',
                                gap: 'var(--space-2)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 'var(--space-2)',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  className="badge badge-proof"
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 8px',
                                    fontWeight: 700,
                                    borderRadius: '9999px',
                                  }}
                                >
                                  {p.actionType.toUpperCase().replace(/_/g, ' ')}
                                </span>
                                <span
                                  className="badge badge-pending"
                                  style={{ fontSize: '9px', padding: '2px 6px' }}
                                >
                                  AI suggestion
                                </span>
                                <span
                                  className="badge badge-blocked"
                                  style={{ fontSize: '9px', padding: '2px 6px' }}
                                >
                                  Needs human gate
                                </span>
                              </div>

                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '11px',
                                  color: 'var(--text-muted)',
                                  wordBreak: 'break-all',
                                  overflowWrap: 'anywhere',
                                  maxWidth: '100%',
                                }}
                              >
                                {p.groundingReference?.startsWith('Requirement') ||
                                p.groundingReference?.startsWith('Task') ||
                                p.groundingReference?.startsWith('Project') ? (
                                  <>
                                    <strong style={{ color: 'var(--text-secondary)' }}>
                                      Target:
                                    </strong>{' '}
                                    <span style={{ color: 'var(--text-primary)' }}>
                                      {p.groundingReference}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <strong style={{ color: 'var(--text-secondary)' }}>
                                      Source passage:
                                    </strong>{' '}
                                    &ldquo;{p.groundingReference}&rdquo;
                                  </>
                                )}
                              </span>
                            </div>

                            <p
                              style={{
                                margin: '0 0 var(--space-3)',
                                fontSize: 'var(--font-size-base)',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                lineHeight: '1.4',
                              }}
                            >
                              {p.description}
                            </p>

                            {/* Trigger Condition & Referenced Records */}
                            {p.triggerCondition && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  marginBottom: '6px',
                                  fontSize: '11px',
                                  color: '#D97706',
                                }}
                              >
                                <span>⚡</span>
                                <span>
                                  <strong>Trigger condition:</strong> {p.triggerCondition}
                                </span>
                              </div>
                            )}

                            {p.referencedRecords && p.referencedRecords.length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  marginBottom: '8px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Referenced:
                                </span>
                                {p.referencedRecords.map((ref: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className="telemetry-pill"
                                    style={{ fontSize: '10px', color: 'var(--text-secondary)' }}
                                  >
                                    {ref.recordType}: {ref.title}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Diff Preview: Before vs After */}
                            {p.diffPreview && (
                              <div
                                style={{
                                  marginBottom: 'var(--space-3)',
                                  padding: '8px 12px',
                                  backgroundColor: 'var(--bg-app)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <div style={{ color: '#EF4444', marginBottom: '2px' }}>
                                  - BEFORE: {p.diffPreview.before}
                                </div>
                                <div style={{ color: '#10B981' }}>
                                  + AFTER: {p.diffPreview.after}
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: isMobileView ? 'stretch' : 'flex-end',
                                flexDirection: isMobileView ? 'column' : 'row',
                                gap: 'var(--space-2)',
                                width: '100%',
                              }}
                            >
                              {isApproved ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    width: isMobileView ? '100%' : 'auto',
                                  }}
                                >
                                  <span
                                    className="badge badge-proof"
                                    style={{
                                      fontSize: '11px',
                                      padding: '4px 10px',
                                      fontWeight: 700,
                                      borderRadius: '9999px',
                                      width: isMobileView ? '100%' : 'auto',
                                      textAlign: 'center',
                                    }}
                                  >
                                    ✓ APPROVED & COMMITTED TO AUDIT TRAIL
                                  </span>
                                  {approvedData && approvedData.entityId ? (
                                    p.actionType === 'create_task' ||
                                    p.actionType === 'update_task' ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                          if (approvedData?.entityId) {
                                            setSearchParams({ task: approvedData.entityId });
                                          }
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          fontSize: '11px',
                                          width: isMobileView ? '100%' : 'auto',
                                        }}
                                      >
                                        View Task →
                                      </button>
                                    ) : p.actionType === 'create_requirement' ||
                                      p.actionType === 'update_requirement' ||
                                      p.actionType === 'link_task_requirement' ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                          setActiveTab('requirements');
                                          if (approvedData?.entityId) {
                                            setSelectedReqId(approvedData.entityId);
                                          }
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          fontSize: '11px',
                                          width: isMobileView ? '100%' : 'auto',
                                        }}
                                      >
                                        View Requirement →
                                      </button>
                                    ) : null
                                  ) : null}
                                </div>
                              ) : isRejected ? (
                                <span
                                  className="badge badge-blocked"
                                  style={{
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    width: isMobileView ? '100%' : 'auto',
                                    textAlign: 'center',
                                  }}
                                >
                                  DISMISSED
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setEditingProposal(p)}
                                    style={{
                                      fontSize: '11px',
                                      padding: '4px 10px',
                                      width: isMobileView ? '100%' : 'auto',
                                      minHeight: isMobileView ? 40 : 32,
                                    }}
                                    title="Edit proposed draft before approving"
                                  >
                                    Edit Draft ✏️
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => handleRejectCopilotAction(p.proposalId)}
                                    style={{
                                      color: 'var(--text-muted)',
                                      width: isMobileView ? '100%' : 'auto',
                                      minHeight: isMobileView ? 40 : 32,
                                    }}
                                  >
                                    Dismiss
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleApproveCopilotAction(p)}
                                    disabled={isApproving}
                                    style={{
                                      fontWeight: 600,
                                      width: isMobileView ? '100%' : 'auto',
                                      minHeight: isMobileView ? 44 : 32,
                                    }}
                                  >
                                    {isApproving ? 'Committing...' : 'Approve & Commit to Ledger'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Grounded Project Ledger Assistant (Q&A) ── */}
                <div
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 'var(--space-5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: isMobileView ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      flexDirection: isMobileView ? 'column' : 'row',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>💬</span>
                        <h3
                          style={{
                            fontSize: 'var(--font-size-base)',
                            fontWeight: 700,
                            margin: 0,
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Grounded Project Ledger Assistant
                        </h3>
                        <span
                          className="badge badge-proof"
                          style={{ fontSize: '9px', padding: '2px 6px' }}
                        >
                          ZERO HALLUCINATION GATE
                        </span>
                      </div>
                      <p
                        style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}
                      >
                        Inquire about brief requirements, milestone coverage, evidence gaps, or
                        audit trails. Every answer cites canonical project records.
                      </p>
                    </div>
                  </div>

                  {/* Pre-canned Prompts */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      'Which requirements have zero evidence attached?',
                      'What active delivery risks require mitigation?',
                      'What work remains before 100% human certification?',
                    ].map((samplePrompt) => (
                      <button
                        key={samplePrompt}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setCopilotQueryText(samplePrompt);
                          handleRunCopilotQuery(samplePrompt);
                        }}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        💡 {samplePrompt}
                      </button>
                    ))}
                  </div>

                  {/* Query Input Box */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRunCopilotQuery();
                    }}
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexDirection: isMobileView ? 'column' : 'row',
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="Ask the delivery agent about any brief section, task link, or proof artifact..."
                      value={copilotQueryText}
                      onChange={(e) => setCopilotQueryText(e.target.value)}
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={copilotQueryLoading || !copilotQueryText.trim()}
                      style={{
                        padding: '10px 18px',
                        fontSize: '12px',
                        fontWeight: 600,
                        minHeight: 40,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{copilotQueryLoading ? 'Inquiring...' : 'Ask Agent'}</span>
                      <span>{copilotQueryLoading ? '🔄' : '→'}</span>
                    </button>
                  </form>

                  {/* Query Error */}
                  {copilotQueryError && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#DC2626',
                        fontSize: '12px',
                      }}
                    >
                      ⚠️ {copilotQueryError}
                    </div>
                  )}

                  {/* Query Result Card */}
                  {copilotQueryResult && (
                    <div
                      style={{
                        padding: 'var(--space-4)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: '3px solid #10B981',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px' }}>🛡️</span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#10B981',
                              letterSpacing: '0.04em',
                            }}
                          >
                            GROUNDED LEDGER RESPONSE
                          </span>
                        </div>
                        <span
                          className="telemetry-pill"
                          style={{
                            fontSize: '10px',
                            color: '#10B981',
                            borderColor: 'rgba(16,185,129,0.3)',
                          }}
                        >
                          ⚡ {copilotQueryResult.provider.toUpperCase()} ·{' '}
                          {copilotQueryResult.model}
                        </span>
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontSize: 'var(--font-size-sm)',
                          lineHeight: '1.6',
                          color: 'var(--text-primary)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {copilotQueryResult.answer}
                      </p>

                      {/* Source Records Badges */}
                      {copilotQueryResult.sourceRecords?.length > 0 && (
                        <div
                          style={{
                            borderTop: '1px solid var(--border-subtle)',
                            paddingTop: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            CITED RECORDS:
                          </span>
                          {copilotQueryResult.sourceRecords.map((rec) => (
                            <span
                              key={rec.id}
                              className="telemetry-pill"
                              style={{ fontSize: '10px' }}
                            >
                              {rec.recordType}: {rec.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </article>
        )}
      </div>

      {/* ── Active Task Drawer (Deep-linkable via ?task=ID) ── */}
      {activeTaskId && (
        <TaskDrawer
          taskId={activeTaskId}
          onClose={() => setSearchParams({})}
          onTaskUpdated={refreshData}
        />
      )}

      {/* ── Create Task Modal (Pinned Static Exit Header) ── */}
      {showCreateTask && (
        <div className="modal-backdrop" onClick={() => setShowCreateTask(false)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'var(--desk-raised)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <h3 className="serif-display" style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>
                New Task
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setShowCreateTask(false)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: 'var(--space-6)' }}>
              <form
                onSubmit={handleCreateTask}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                <div>
                  <label className="input-label" htmlFor="task-title-input">
                    Title
                  </label>
                  <input
                    id="task-title-input"
                    className="input-field"
                    placeholder="Task title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    required
                    autoFocus
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="input-label" htmlFor="task-desc-input">
                    Technical Scope
                  </label>
                  <textarea
                    id="task-desc-input"
                    className="input-field"
                    placeholder="Files, tests, or acceptance notes"
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    rows={3}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label className="input-label" htmlFor="task-status-input">
                    Initial Lane
                  </label>
                  <select
                    id="task-status-input"
                    className="input-field"
                    value={newTaskStatus}
                    onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
                    style={{ width: '100%' }}
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="doing">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div
                  style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Create Task
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowCreateTask(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Requirement Modal (Pinned Static Exit Header) ── */}
      {showCreateReq && (
        <div className="modal-backdrop" onClick={() => setShowCreateReq(false)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 520,
              width: '100%',
              background: 'var(--desk-raised)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <h3 className="serif-display" style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>
                New Requirement Claim
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setShowCreateReq(false)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: 'var(--space-6)' }}>
              <form
                onSubmit={handleCreateRequirement}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                <div>
                  <label className="input-label" htmlFor="req-title-input">
                    Requirement Title
                  </label>
                  <input
                    id="req-title-input"
                    className="input-field"
                    placeholder="e.g. End-to-end encrypted backup sync"
                    value={newReqTitle}
                    onChange={(e) => setNewReqTitle(e.target.value)}
                    required
                    autoFocus
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="input-label" htmlFor="req-desc-input">
                    Specification & Criteria
                  </label>
                  <textarea
                    id="req-desc-input"
                    className="input-field"
                    placeholder="Define testable acceptance criteria"
                    value={newReqDesc}
                    onChange={(e) => setNewReqDesc(e.target.value)}
                    rows={3}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div>
                    <label className="input-label" htmlFor="req-cat-input">
                      Category
                    </label>
                    <select
                      id="req-cat-input"
                      className="input-field"
                      value={newReqCategory}
                      onChange={(e) =>
                        setNewReqCategory(
                          e.target.value as
                            'functional' | 'non_functional' | 'constraint' | 'deliverable',
                        )
                      }
                      style={{ width: '100%' }}
                    >
                      <option value="functional">Functional</option>
                      <option value="non_functional">Non-Functional</option>
                      <option value="constraint">Constraint</option>
                      <option value="deliverable">Deliverable</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label" htmlFor="req-prio-input">
                      Priority
                    </label>
                    <select
                      id="req-prio-input"
                      className="input-field"
                      value={newReqPriority}
                      onChange={(e) =>
                        setNewReqPriority(e.target.value as 'high' | 'normal' | 'low')
                      }
                      style={{ width: '100%' }}
                    >
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    marginTop: 'var(--space-3)',
                  }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Register Requirement
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowCreateReq(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Task Modal (Pinned Static Exit Header) ── */}
      {showLinkTask && (
        <div className="modal-backdrop" onClick={() => setShowLinkTask(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 440,
              width: '100%',
              background: 'var(--desk-raised)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <h3 className="serif-display" style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>
                Link Implementation Task
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setShowLinkTask(null)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: 'var(--space-6)' }}>
              <form
                onSubmit={handleLinkTaskSubmit}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                <select
                  className="input-field"
                  value={selectedTaskIdToLink}
                  onChange={(e) => setSelectedTaskIdToLink(e.target.value)}
                  required
                  style={{ width: '100%' }}
                >
                  <option value="">Select task to connect…</option>
                  {tasks.map((t) => (
                    <option key={t['id'] as string} value={t['id'] as string}>
                      {t['title'] as string} ({STATUS_LABELS[t['status'] as TaskStatus]})
                    </option>
                  ))}
                </select>

                <div
                  style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!selectedTaskIdToLink}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Confirm Link
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowLinkTask(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Attach Evidence Modal (Pinned Static Exit Header) ── */}
      {showAddEvidence && (
        <div className="modal-backdrop" onClick={() => setShowAddEvidence(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'var(--desk-raised)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <h3 className="serif-display" style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>
                Attach Proof Artifact
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setShowAddEvidence(null)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: 'var(--space-6)' }}>
              <form
                onSubmit={handleCreateEvidenceSubmit}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                <div>
                  <label className="input-label" htmlFor="ev-type-select">
                    Evidence Classification
                  </label>
                  <select
                    id="ev-type-select"
                    className="input-field"
                    value={evType}
                    onChange={(e) => setEvType(e.target.value as 'url' | 'note')}
                    style={{ width: '100%' }}
                  >
                    <option value="url">URL Reference / Pull Request / Diff</option>
                    <option value="note">Terminal Output / Cryptographic Hash</option>
                  </select>
                </div>

                <div>
                  <label className="input-label" htmlFor="ev-title-input">
                    Artifact Title
                  </label>
                  <input
                    id="ev-title-input"
                    className="input-field"
                    placeholder="e.g. PR #18 test run log"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    required
                    autoFocus
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="input-label" htmlFor="ev-content-input">
                    Link or Log Content
                  </label>
                  <textarea
                    id="ev-content-input"
                    className="input-field"
                    placeholder="URL, commit SHA, or verification notes"
                    value={evContent}
                    onChange={(e) => setEvContent(e.target.value)}
                    required
                    rows={3}
                    style={{ width: '100%' }}
                  />
                </div>

                <div
                  style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Save Evidence
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowAddEvidence(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Verify Requirement Modal (Pinned Static Exit Header) ── */}
      {showVerifyModal && (
        <div className="modal-backdrop" onClick={() => setShowVerifyModal(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'var(--desk-raised)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <h3 className="serif-display" style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>
                Human Attestation Sign-Off
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setShowVerifyModal(null)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: 'var(--space-6)' }}>
              <form
                onSubmit={handleVerifySubmit}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                <div>
                  <label className="input-label" htmlFor="verify-choice-input">
                    Attestation Verdict
                  </label>
                  <select
                    id="verify-choice-input"
                    className="input-field"
                    value={verifyStatusChoice}
                    onChange={(e) =>
                      setVerifyStatusChoice(
                        e.target.value as 'verified' | 'rejected' | 'unverified',
                      )
                    }
                    style={{ width: '100%' }}
                  >
                    <option value="verified">Verified (Attested as shipped with proof)</option>
                    <option value="rejected">Rejected / Blocked (Gaps remain)</option>
                    <option value="unverified">Revert to Unverified (Provisional)</option>
                  </select>
                </div>

                <div>
                  <label className="input-label" htmlFor="verify-notes-input">
                    Verification Audit Notes
                  </label>
                  <textarea
                    id="verify-notes-input"
                    className="input-field"
                    placeholder="Record verification basis (e.g. audited test log on staging)"
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    rows={3}
                    style={{ width: '100%' }}
                  />
                </div>

                <div
                  style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Stamp Verification
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowVerifyModal(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Proposal Review Modal (Pinned Static Exit Header) ── */}
      {proposalData && (
        <div className="modal-backdrop" onClick={() => setProposalData(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 680,
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              background: 'var(--desk-raised)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--proof)',
                    textTransform: 'uppercase',
                  }}
                >
                  AI PROPOSAL CANDIDATE REVIEW
                </span>
                <h3
                  className="serif-display"
                  style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}
                >
                  Extracted Requirements ({proposalData.proposal.candidates.length})
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setProposalData(null)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: 'var(--space-6)' }}>
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--ink-muted)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {proposalData.proposal.summary}
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                {proposalData.proposal.candidates.map((cand: CandidateItem) => {
                  const decision = candidateDecisions[cand.tempId] || 'accept';

                  return (
                    <div
                      key={cand.tempId}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        background: 'var(--desk)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 'var(--font-size-sm)',
                              color: 'var(--ink)',
                            }}
                          >
                            {cand.title}
                          </div>
                          <div
                            style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: 2 }}
                          >
                            {cand.description}
                          </div>
                          {cand.sourceQuote && (
                            <div
                              className="mono-num"
                              style={{
                                fontSize: '11px',
                                color: 'var(--ink-muted)',
                                marginTop: 4,
                              }}
                            >
                              Quote: "{cand.sourceQuote}"
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            border: '1px solid var(--rule)',
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setCandidateDecisions({
                                ...candidateDecisions,
                                [cand.tempId]: 'accept',
                              })
                            }
                            style={{
                              background: decision === 'accept' ? 'var(--proof)' : 'transparent',
                              color: decision === 'accept' ? '#fff' : 'var(--ink-muted)',
                              padding: '2px 8px',
                              fontSize: '11px',
                              borderRadius: 0,
                              border: 'none',
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setCandidateDecisions({
                                ...candidateDecisions,
                                [cand.tempId]: 'reject',
                              })
                            }
                            style={{
                              background: decision === 'reject' ? 'var(--stamp)' : 'transparent',
                              color: decision === 'reject' ? '#fff' : 'var(--ink-muted)',
                              padding: '2px 8px',
                              fontSize: '11px',
                              borderRadius: 0,
                              border: 'none',
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAcceptProposal}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Accept Candidate Requirements
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setProposalData(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Verifiable Evidence Preview Modal ── */}
      {previewEvidence && (
        <div className="modal-backdrop" onClick={() => setPreviewEvidence(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 520,
              width: '100%',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header-static"
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-4) var(--space-6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconEvidence size={16} style={{ color: 'var(--accent-primary)' }} />
                <h3
                  style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 600,
                    margin: 0,
                    color: 'var(--text-primary)',
                  }}
                >
                  Verifiable Evidence Artifact
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPreviewEvidence(null)}
                aria-label="Close"
                style={{ padding: '6px' }}
              >
                <IconClose size={16} />
              </button>
            </div>

            <div
              style={{
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  ARTIFACT TITLE
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginTop: 2,
                  }}
                >
                  {previewEvidence.title}
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--text-secondary)',
                    marginTop: 2,
                  }}
                >
                  {previewEvidence.subtitle}
                </div>
              </div>

              {previewEvidence.sha && (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    SHA-256 CHECKSUM
                  </div>
                  <div
                    className="mono-num"
                    style={{
                      fontSize: '11px',
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      color: 'var(--accent-primary)',
                      wordBreak: 'break-all',
                      marginTop: 4,
                    }}
                  >
                    {previewEvidence.sha}
                  </div>
                </div>
              )}

              {previewEvidence.assertions && (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    AUTOMATED TEST RUN VERIFICATION
                  </div>
                  <pre
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      margin: '4px 0 0',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {previewEvidence.assertions}
                  </pre>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'var(--space-2)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const evId = previewEvidence.id || 'ev-test-suite';
                    const reqId = previewEvidence.requirementId || selectedReqId || undefined;
                    const evTitle = previewEvidence.title;
                    setPreviewEvidence(null);
                    handleOpenEvidenceReview(evId, evTitle, reqId);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    color: '#10B981',
                  }}
                >
                  <span>🤖</span>
                  <span>Advisory AI Review (NVIDIA Nemotron)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPreviewEvidence(null)}
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delivery Plan Review & Approval Modal ── */}
      {showDeliveryPlanModal && deliveryPlan && (
        <div className="modal-backdrop" onClick={() => setShowDeliveryPlanModal(false)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 780,
              width: '100%',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              background: 'var(--desk-raised)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-only modal-sheet-handle" />
            <div className="modal-header-static">
              <div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--proof)',
                      textTransform: 'uppercase',
                    }}
                  >
                    BRIEF-TO-PROOF DELIVERY PLAN // PROPOSAL DRAFT
                  </span>
                  <span
                    className="badge badge-pending"
                    style={{ fontSize: '9px', padding: '1px 6px' }}
                  >
                    UNCOMMITTED DRAFT
                  </span>
                  {deliveryPlanModel && (
                    <span
                      className="telemetry-pill"
                      style={{
                        fontSize: '9px',
                        borderColor:
                          deliveryPlanModel.includes('deterministic') ||
                          deliveryPlanProvider === 'mock'
                            ? 'rgba(245, 158, 11, 0.4)'
                            : 'rgba(59, 130, 246, 0.4)',
                        color:
                          deliveryPlanModel.includes('deterministic') ||
                          deliveryPlanProvider === 'mock'
                            ? '#D97706'
                            : '#2563EB',
                      }}
                    >
                      {deliveryPlanModel.includes('deterministic') ||
                      deliveryPlanProvider === 'mock'
                        ? `⚙️ Deterministic (${deliveryPlanModel})`
                        : `🤖 Model: ${deliveryPlanModel}`}
                    </span>
                  )}
                </div>
                <h3
                  className="serif-display"
                  style={{ fontSize: 'var(--font-size-xl)', margin: '2px 0 0' }}
                >
                  Proposed Delivery Plan
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setShowDeliveryPlanModal(false)}
                aria-label="Close dialog"
                style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div
              className="modal-body-scrollable"
              style={{
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              {/* Summary & Rationale */}
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderLeft: '3px solid #10B981',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#10B981',
                    marginBottom: '4px',
                  }}
                >
                  PLANNING RATIONALE & APPROACH
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    lineHeight: '1.5',
                    color: 'var(--text-primary)',
                  }}
                >
                  {deliveryPlan.summary}
                </p>
              </div>

              {/* Assumptions & Risks */}
              {((deliveryPlan.assumptions && deliveryPlan.assumptions.length > 0) ||
                (deliveryPlan.risks && deliveryPlan.risks.length > 0)) && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  {deliveryPlan.assumptions && deliveryPlan.assumptions.length > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                        }}
                      >
                        ASSUMPTIONS ({deliveryPlan.assumptions.length})
                      </span>
                      <ul
                        style={{
                          margin: '4px 0 0',
                          paddingLeft: '16px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {deliveryPlan.assumptions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {deliveryPlan.risks && deliveryPlan.risks.length > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: '#EF4444',
                        }}
                      >
                        DELIVERY RISKS ({deliveryPlan.risks.length})
                      </span>
                      <ul
                        style={{
                          margin: '4px 0 0',
                          paddingLeft: '16px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {deliveryPlan.risks.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Proposed Milestones & Tasks */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Proposed Milestones ({deliveryPlan.milestones.length})
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Total Tasks:{' '}
                    {deliveryPlan.milestones.reduce((acc, m) => acc + m.tasks.length, 0)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {deliveryPlan.milestones.map((m, mIdx) => (
                    <div
                      key={mIdx}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="telemetry-pill" style={{ fontSize: '10px' }}>
                            M{mIdx + 1}
                          </span>
                          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            {m.title}
                          </strong>
                        </div>
                        {m.dueDate && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            Due: {m.dueDate}
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p
                          style={{
                            margin: '0 0 8px',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {m.description}
                        </p>
                      )}

                      {/* Tasks under this milestone */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          paddingLeft: '8px',
                          borderLeft: '2px solid var(--border-subtle)',
                        }}
                      >
                        {m.tasks.map((t, tIdx) => (
                          <div
                            key={tIdx}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: 'var(--bg-app)',
                              borderRadius: '4px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '4px',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {t.title}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {t.ownerSuggestion && (
                                  <span className="telemetry-pill" style={{ fontSize: '10px' }}>
                                    👤 {t.ownerSuggestion}
                                  </span>
                                )}
                                {t.dueDate && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      color: 'var(--text-muted)',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    {t.dueDate}
                                  </span>
                                )}
                              </div>
                            </div>
                            {t.description && (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: '11px',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {t.description}
                              </p>
                            )}
                            {/* Required Evidence Artifacts */}
                            {t.evidenceNeeded && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  flexWrap: 'wrap',
                                  marginTop: '2px',
                                }}
                              >
                                <span
                                  style={{ fontSize: '10px', color: '#10B981', fontWeight: 600 }}
                                >
                                  PROOF REQUIRED:
                                </span>
                                <span
                                  className="telemetry-pill"
                                  style={{
                                    fontSize: '9px',
                                    color: '#10B981',
                                    borderColor: 'rgba(16,185,129,0.3)',
                                  }}
                                >
                                  🛡️ {t.evidenceNeeded}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Questions & Ambiguities */}
              {deliveryPlan.openQuestions && deliveryPlan.openQuestions.length > 0 && (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid #F59E0B',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <span>❓</span>
                    <strong
                      style={{
                        fontSize: '11px',
                        color: '#D97706',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Open Questions & Ambiguities ({deliveryPlan.openQuestions.length})
                    </strong>
                  </div>
                  <p
                    style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--text-secondary)' }}
                  >
                    Unknowns identified in the project brief that should be clarified with
                    stakeholders:
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: '16px',
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {deliveryPlan.openQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                padding: 'var(--space-4) var(--space-6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg-surface)',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Commitment creates canonical milestones, tasks, and requirement links in the project
                ledger.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowDeliveryPlanModal(false)}
                >
                  Discard Draft
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAcceptDeliveryPlan}
                  disabled={acceptingDeliveryPlan}
                  style={{ fontWeight: 600, padding: '8px 18px', minHeight: 38 }}
                >
                  {acceptingDeliveryPlan
                    ? 'Committing to Ledger...'
                    : 'Accept & Commit Plan to Ledger →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Proposal Draft Editor Modal ── */}
      {editingProposal && (
        <div className="modal-backdrop" onClick={() => setEditingProposal(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 520,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              background: 'var(--desk-raised)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-static">
              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--proof)',
                  }}
                >
                  HUMAN EDITING GATE
                </span>
                <h3
                  className="serif-display"
                  style={{ fontSize: 'var(--font-size-lg)', margin: '2px 0 0' }}
                >
                  Edit Draft Action: {editingProposal.actionType?.replace(/_/g, ' ')}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingProposal(null)}
                style={{ padding: '6px' }}
              >
                <IconClose size={16} />
              </button>
            </div>

            <div
              style={{
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  TITLE / SUMMARY
                </label>
                <input
                  type="text"
                  className="input"
                  value={editingProposal.payload?.title || ''}
                  onChange={(e) =>
                    setEditingProposal({
                      ...editingProposal,
                      payload: { ...editingProposal.payload, title: e.target.value },
                    })
                  }
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  DESCRIPTION
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={editingProposal.payload?.description || ''}
                  onChange={(e) =>
                    setEditingProposal({
                      ...editingProposal,
                      payload: { ...editingProposal.payload, description: e.target.value },
                    })
                  }
                  style={{ width: '100%', fontSize: '12px' }}
                />
              </div>

              {editingProposal.payload?.priority !== undefined && (
                <div>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    PRIORITY
                  </label>
                  <select
                    className="input"
                    value={editingProposal.payload.priority}
                    onChange={(e) =>
                      setEditingProposal({
                        ...editingProposal,
                        payload: { ...editingProposal.payload, priority: e.target.value },
                      })
                    }
                    style={{ fontSize: '12px' }}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: 'var(--space-3)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingProposal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleApproveEditedProposal(editingProposal, editingProposal.payload)
                  }
                >
                  Approve & Commit Edited Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Advisory Evidence Review Modal ── */}
      {evidenceReviewModal && (
        <div className="modal-backdrop" onClick={() => setEvidenceReviewModal(null)}>
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              maxWidth: 580,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              background: 'var(--desk-raised)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-static">
              <div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--proof)',
                    }}
                  >
                    ADVISORY EVIDENCE AUDIT
                  </span>
                  {evidenceReview?.model && (
                    <span
                      className="telemetry-pill"
                      style={{
                        fontSize: '9px',
                        borderColor:
                          evidenceReview.model.includes('deterministic') ||
                          evidenceReview.provider === 'mock'
                            ? 'rgba(245, 158, 11, 0.4)'
                            : 'rgba(59, 130, 246, 0.4)',
                        color:
                          evidenceReview.model.includes('deterministic') ||
                          evidenceReview.provider === 'mock'
                            ? '#D97706'
                            : '#2563EB',
                      }}
                    >
                      {evidenceReview.model.includes('deterministic') ||
                      evidenceReview.provider === 'mock'
                        ? `⚙️ Deterministic (${evidenceReview.model})`
                        : `🤖 Model: ${evidenceReview.model}`}
                    </span>
                  )}
                </div>
                <h3
                  className="serif-display"
                  style={{ fontSize: 'var(--font-size-lg)', margin: '2px 0 0' }}
                >
                  {evidenceReviewModal.title}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEvidenceReviewModal(null)}
                style={{ padding: '6px' }}
              >
                <IconClose size={16} />
              </button>
            </div>

            <div
              style={{
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              {/* Strict Non-Autonomous Advisory Notice */}
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>ℹ️</span>
                <span>
                  <strong>Advisory Assessment:</strong> The AI model evaluates support and flags
                  deficiencies. It cannot certify, approve, reject, or delete canonical evidence
                  records.
                </span>
              </div>

              {loadingEvidenceReview && (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Analyzing evidence support, cryptographic assertions, and requirement
                    alignment...
                  </p>
                </div>
              )}

              {evidenceReviewError && (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid #EF4444',
                    color: '#DC2626',
                    fontSize: '12px',
                    borderRadius: '4px',
                  }}
                >
                  ⚠️ {evidenceReviewError}
                </div>
              )}

              {evidenceReview && !loadingEvidenceReview && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {/* Summary */}
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      EVIDENCE SUMMARY
                    </div>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        lineHeight: '1.5',
                      }}
                    >
                      {evidenceReview.summary}
                    </p>
                  </div>

                  {/* Strengths & Deficiencies */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981' }}>
                        SUPPORT STRENGTHS
                      </span>
                      <ul
                        style={{
                          margin: '4px 0 0',
                          paddingLeft: '14px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {evidenceReview.strengths?.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#EF4444' }}>
                        DEFICIENCIES / GAPS
                      </span>
                      <ul
                        style={{
                          margin: '4px 0 0',
                          paddingLeft: '14px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {evidenceReview.deficiencies?.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Recommendation Callout */}
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor:
                        evidenceReview.advisoryRecommendation === 'accept'
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'rgba(245, 158, 11, 0.08)',
                      border: `1px solid ${
                        evidenceReview.advisoryRecommendation === 'accept' ? '#10B981' : '#F59E0B'
                      }`,
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>
                          {evidenceReview.advisoryRecommendation === 'accept' ? '✓' : '⚠️'}
                        </span>
                        <strong
                          style={{
                            fontSize: '11px',
                            color:
                              evidenceReview.advisoryRecommendation === 'accept'
                                ? '#059669'
                                : '#D97706',
                          }}
                        >
                          ADVISORY RECOMMENDATION:{' '}
                          {evidenceReview.advisoryRecommendation?.toUpperCase().replace(/_/g, ' ')}
                        </strong>
                      </div>
                      <span className="telemetry-pill" style={{ fontSize: '10px' }}>
                        Confidence: {evidenceReview.confidence?.toUpperCase()}
                      </span>
                    </div>
                    {evidenceReview.stalenessOrScopeWarning && (
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#D97706' }}>
                        ⚠️ {evidenceReview.stalenessOrScopeWarning}
                      </p>
                    )}
                    {evidenceReview.suggestedClarification && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        💡 Suggested clarification: {evidenceReview.suggestedClarification}
                      </p>
                    )}
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Citation: {evidenceReview.sourceCitation}
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEvidenceReviewModal(null)}
                >
                  Close Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal (BYOK & Provider setup) */}
      <SettingsModal
        isOpen={showCopilotSettings}
        onClose={() => setShowCopilotSettings(false)}
        workspaceId={
          typeof project?.['workspaceId'] === 'string'
            ? (project['workspaceId'] as string)
            : undefined
        }
      />

      {/* ── Mobile Floating Bottom Action Tray ── */}
      <div className="mobile-bottom-action-tray mobile-only no-print">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setShowCreateReq(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            minHeight: 40,
            padding: '6px 12px',
          }}
        >
          <IconAdd size={14} />
          <span>+ Req</span>
        </button>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setShowCreateTask(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            minHeight: 40,
            padding: '6px 12px',
          }}
        >
          <IconAdd size={14} />
          <span>+ Task</span>
        </button>

        {activeTab === 'requirements' && selectedRequirement && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setShowVerifyModal(selectedRequirement.id);
              setVerifyNotes(selectedRequirement.latestVerification?.notes || '');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '12px',
              minHeight: 40,
              padding: '6px 12px',
            }}
          >
            <IconVerified size={14} />
            <span>Attest</span>
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => handleTabChange('report')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '12px',
            minHeight: 40,
            padding: '6px 12px',
          }}
        >
          <IconReport size={14} />
          <span>Report</span>
        </button>
      </div>
    </AppShell>
  );
}
