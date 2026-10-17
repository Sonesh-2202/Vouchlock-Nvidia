/**
 * Custom inline-SVG icon library for ProjectPilot.
 * Designed on a 20x20 grid with 1.5px stroke, square caps, and 2px corner joins.
 * Replaces all generic icon libraries with bespoke, ledger-aligned vector glyphs.
 */

import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

const defaultProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  'aria-hidden': true,
};

export function ProjectIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <path d="M2.5 7.5h15" />
      <path d="M7.5 7.5v9" />
    </svg>
  );
}

export function TaskIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M6.5 10l2.5 2.5 5-5" strokeLinecap="round" />
    </svg>
  );
}

export function RequirementIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M4 2.5h10l3.5 3.5V17.5H4V2.5z" />
      <path d="M14 2.5v3.5h3.5" />
      <path d="M7 10h6" />
      <path d="M7 13.5h4" />
    </svg>
  );
}

export function BriefIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <rect x="3" y="2.5" width="14" height="15" rx="1.5" />
      <path d="M6.5 6.5h7" />
      <path d="M6.5 10h7" />
      <path d="M6.5 13.5h4.5" />
    </svg>
  );
}

export function ResourceIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M4 16.5V4a1.5 1.5 0 0 1 1.5-1.5H16v14H5.5A1.5 1.5 0 0 0 4 18" />
      <path d="M4 16.5A1.5 1.5 0 0 1 5.5 15H16v3H5.5A1.5 1.5 0 0 1 4 16.5z" />
      <path d="M7.5 6.5h5.5" />
      <path d="M7.5 9.5h4" />
    </svg>
  );
}

export function PinIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M12 2.5l5.5 5.5-2.5 2.5-1-1-4 4v4l-2-2v-3.5L4.5 8.5 7 6l-1-1 2.5-2.5z" />
      <path d="M2.5 17.5l4-4" />
    </svg>
  );
}

export function CopyIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <rect x="6.5" y="6.5" width="10" height="10" rx="1.5" />
      <path d="M3.5 13.5v-9A1 1 0 0 1 4.5 3.5h9" />
    </svg>
  );
}

export function TrashIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3.5 5.5h13" />
      <path d="M7.5 5.5v-2h5v2" />
      <path d="M5.5 5.5v11a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5v-11" />
      <path d="M8.5 9v5" />
      <path d="M11.5 9v5" />
    </svg>
  );
}

export function EvidenceIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M11.5 5.5l3 3-7 7H4.5v-3l7-7z" />
      <path d="M13.5 3.5a1.414 1.414 0 012 2l-1 1-2-2 1-1z" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Notched-square verification stamp mark — signature proof icon.
 */
export function VerifiedIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3.5 6.5V3.5h3l3.5-2 3.5 2h3v3l2 3.5-2 3.5v3h-3l-3.5 2-3.5-2h-3v-3l-2-3.5 2-3.5z" />
      <path d="M6.5 10.5l2.5 2.5 5-5" strokeLinecap="round" />
    </svg>
  );
}

export function UnverifiedIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="10" r="7" strokeDasharray="3 3" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function BlockedIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M4.5 15.5l11-11" />
    </svg>
  );
}

export function ActiveIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.5l3 1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DoneIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.5 10l2.5 2.5 5-5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Plan Draft mark — pencil and ruled lines, NEVER sparkles or magic wands.
 */
export function PlanDraftIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3 16.5h14" />
      <path d="M5.5 13.5l8-8 3 3-8 8H5.5v-3z" />
      <path d="M11.5 7.5l2 2" />
    </svg>
  );
}

export function ReportIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <rect x="3" y="2.5" width="14" height="15" rx="1.5" />
      <path d="M6.5 6.5h7" />
      <path d="M6.5 10h7" />
      <path d="M6.5 13.5h3.5" />
      <circle cx="13.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CommentIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3 4.5h14v10H8l-4 3V4.5z" />
    </svg>
  );
}

export function MemberIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="6.5" r="3.5" />
      <path d="M3.5 17c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" />
    </svg>
  );
}

export function InviteIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="8" cy="6.5" r="3" />
      <path d="M2.5 16.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" />
      <path d="M15.5 8.5v4" />
      <path d="M13.5 10.5h4" />
    </svg>
  );
}

export function ExportIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3.5 13.5v3h13v-3" />
      <path d="M10 2.5v10" strokeLinecap="round" />
      <path d="M6.5 9l3.5 3.5 3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function SummaryIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3 16.5h14" />
      <rect x="5" y="10" width="2.5" height="6.5" />
      <rect x="9" y="6" width="2.5" height="10.5" />
      <rect x="13" y="3.5" width="2.5" height="13" />
    </svg>
  );
}

export function KanbanIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <rect x="2.5" y="3.5" width="4" height="13" rx="1" />
      <rect x="8" y="3.5" width="4" height="9" rx="1" />
      <rect x="13.5" y="3.5" width="4" height="11" rx="1" />
    </svg>
  );
}

export function ListIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3.5 5.5h13" />
      <path d="M3.5 10h13" />
      <path d="M3.5 14.5h13" />
    </svg>
  );
}

export function FilterIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3 4.5h14l-5.5 6.5v5l-3-2v-3L3 4.5z" />
    </svg>
  );
}

export function SearchIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.5 12.5l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

export function AddIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M10 4v12" strokeLinecap="round" />
      <path d="M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M5 5l10 10" strokeLinecap="round" />
      <path d="M15 5L5 15" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M12 4l-6 6 6 6" strokeLinecap="round" />
    </svg>
  );
}

export function MoreIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="4" cy="10" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DragHandleIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="7" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="14" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M7.5 5l5 5-5 5" strokeLinecap="round" />
    </svg>
  );
}

export function SunIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="10" r="4" />
      <path
        d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.5 1.5M14 14l1.5 1.5M4.5 15.5l1.5-1.5M14 6l1.5-1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M15.5 11.5A6.5 6.5 0 118.5 4.5a6.5 6.5 0 007 7z" />
    </svg>
  );
}

export function ResetIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M4.5 9.5a6 6 0 111.5 4.2" strokeLinecap="round" />
      <path d="M4 5.5v4h4" strokeLinecap="round" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M9 4.5h6.5v6.5" strokeLinecap="round" />
      <path d="M15.5 4.5l-8 8" strokeLinecap="round" />
      <path d="M12 11.5v4H4.5V8h4" />
    </svg>
  );
}

export function CheckIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M4.5 10l4 4 7-8" strokeLinecap="round" />
    </svg>
  );
}

export function MenuIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" strokeLinecap="round" />
    </svg>
  );
}

export function ActivityIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.5l3 2" />
    </svg>
  );
}

export function LogoutIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M7.5 3.5H4.5a1.5 1.5 0 00-1.5 1.5v10a1.5 1.5 0 001.5 1.5h3" />
      <path d="M13 13.5l3.5-3.5L13 6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 10H7.5" strokeLinecap="round" />
    </svg>
  );
}

export function AlertIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} {...defaultProps} {...props}>
      <path d="M10 2.5l7.5 13.5H2.5L10 2.5z" strokeLinejoin="round" />
      <path d="M10 7.5v4" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.75" fill="currentColor" />
    </svg>
  );
}

// Aliases for Icon* naming
export {
  ProjectIcon as IconProject,
  TaskIcon as IconTask,
  RequirementIcon as IconRequirement,
  BriefIcon as IconBrief,
  EvidenceIcon as IconEvidence,
  VerifiedIcon as IconVerified,
  UnverifiedIcon as IconUnverified,
  BlockedIcon as IconBlocked,
  ActiveIcon as IconActive,
  DoneIcon as IconDone,
  PlanDraftIcon as IconPlanDraft,
  ReportIcon as IconReport,
  CommentIcon as IconComment,
  MemberIcon as IconMember,
  InviteIcon as IconInvite,
  ExportIcon as IconExport,
  SummaryIcon as IconSummary,
  KanbanIcon as IconKanban,
  ListIcon as IconList,
  FilterIcon as IconFilter,
  SearchIcon as IconSearch,
  AddIcon as IconAdd,
  CloseIcon as IconClose,
  BackIcon as IconBack,
  MoreIcon as IconMore,
  DragHandleIcon as IconDragHandle,
  ChevronDownIcon as IconChevronDown,
  ChevronRightIcon as IconChevronRight,
  SunIcon as IconSun,
  MoonIcon as IconMoon,
  ResetIcon as IconReset,
  LogoutIcon as IconLogout,
  AlertIcon as IconAlert,
  ExternalLinkIcon as IconExternalLink,
  CheckIcon as IconCheck,
  MenuIcon as IconMenu,
  ActivityIcon as IconActivity,
  ResourceIcon as IconResource,
  PinIcon as IconPin,
  CopyIcon as IconCopy,
  TrashIcon as IconTrash,
};
