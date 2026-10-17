/**
 * TaskDrawer — 480px Right-side Drawer for Task Details & Discussion.
 * Built for The Delivery Ledger design:
 * - Serif task title
 * - Inline status selection menu (replaces button wall)
 * - Two-column definition list of task metadata
 * - Linked requirements and evidence section
 * - Comments & activity timeline with initials avatars
 * - Pinned composer at bottom (Cmd/Ctrl+Enter to post)
 * - Esc to close, focus management
 */

import { useState, useEffect, type FormEvent } from 'react';
import { api, ApiRequestError, type AuthUser } from '../api.js';
import { pauseSmoothScroll, resumeSmoothScroll } from '../motion.js';
import { IconClose } from './icons.js';

interface TaskDrawerProps {
  taskId: string | null;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export function TaskDrawer({ taskId, onClose, onTaskUpdated }: TaskDrawerProps) {
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [comments, setComments] = useState<Array<Record<string, unknown>>>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit description state
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  // Comment composer state
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Comment editing & deletion state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState(false);

  // Task deletion confirmation state
  const [showDeleteTaskConfirm, setShowDeleteTaskConfirm] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  useEffect(() => {
    api.auth
      .me()
      .then((res) => setCurrentUser(res.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (taskId) {
      pauseSmoothScroll();
      loadTaskData(taskId);
    }
    return () => {
      resumeSmoothScroll();
    };
  }, [taskId]);

  // Handle ESC key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function loadTaskData(id: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.tasks.get(id);
      setTask(data.task);
      setComments(data.comments || []);
      setDescValue((data.task['description'] as string) || '');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!taskId || !task) return;
    try {
      await api.tasks.update(taskId, {
        status: newStatus,
        version: task['version'] as number,
      });
      await loadTaskData(taskId);
      onTaskUpdated?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to update status');
    }
  }

  async function handleSaveDescription() {
    if (!taskId || !task) return;
    setSavingDesc(true);
    try {
      await api.tasks.update(taskId, {
        description: descValue.trim(),
        version: task['version'] as number,
      });
      setIsEditingDesc(false);
      await loadTaskData(taskId);
      onTaskUpdated?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to save description');
    } finally {
      setSavingDesc(false);
    }
  }

  async function handleAddComment(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!taskId || !commentText.trim()) return;
    setPostingComment(true);
    try {
      await api.tasks.addComment(taskId, { body: commentText.trim() });
      setCommentText('');
      await loadTaskData(taskId);
      onTaskUpdated?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  }

  function handleStartEditComment(cmt: Record<string, unknown>) {
    setEditingCommentId(cmt['id'] as string);
    setEditCommentText((cmt['body'] as string) || '');
  }

  async function handleSaveCommentEdit(commentId: string) {
    if (!taskId || !editCommentText.trim()) return;
    setSavingCommentEdit(true);
    try {
      await api.tasks.editComment(taskId, commentId, { body: editCommentText.trim() });
      setEditingCommentId(null);
      await loadTaskData(taskId);
      onTaskUpdated?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to update comment');
    } finally {
      setSavingCommentEdit(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!taskId) return;
    setDeletingComment(true);
    try {
      await api.tasks.deleteComment(taskId, commentId);
      setDeletingCommentId(null);
      await loadTaskData(taskId);
      onTaskUpdated?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to delete comment');
    } finally {
      setDeletingComment(false);
    }
  }

  async function handleDeleteTask() {
    if (!taskId) return;
    setDeletingTask(true);
    try {
      await api.tasks.delete(taskId);
      setShowDeleteTaskConfirm(false);
      onTaskUpdated?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to delete task');
      setDeletingTask(false);
    }
  }

  if (!taskId) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Task Details Drawer"
      style={{ justifyContent: 'flex-end', padding: 0 }}
    >
      <div
        className="drawer animate-in"
        data-lenis-prevent
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100%',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--rule)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Bottom Sheet Pull Handle */}
        <div className="mobile-only modal-sheet-handle" />

        {/* Drawer Header (Static & Pinned) */}
        <div
          className="modal-header-static"
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            flexShrink: 0,
            background: 'var(--desk-raised)',
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-1)',
              }}
            >
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                TASK #{taskId.slice(-4).toUpperCase()}
              </span>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--proof)' }}>
                REV {task ? (task['version'] as number) : 1}
              </span>
            </div>
            <h3
              className="serif-display"
              style={{
                fontSize: 'var(--font-size-xl)',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.25,
                wordBreak: 'break-word',
              }}
            >
              {task ? (task['title'] as string) : 'Loading task…'}
            </h3>
          </div>

          <div
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}
          >
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowDeleteTaskConfirm(true)}
              title="Permanently delete this task"
              style={{
                color: 'var(--stamp)',
                padding: '6px 10px',
                fontSize: '11px',
                minHeight: 36,
              }}
            >
              Delete Task
            </button>
            <button
              className="btn btn-ghost btn-sm touch-target"
              onClick={onClose}
              aria-label="Close drawer"
              style={{ padding: '6px', minWidth: 40, minHeight: 40, flexShrink: 0 }}
            >
              <IconClose size={20} />
            </button>
          </div>
        </div>

        {/* Delete Task Confirmation Banner */}
        {showDeleteTaskConfirm && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-6)',
              background: 'var(--stamp-subtle)',
              borderBottom: '1px solid var(--stamp)',
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              flexShrink: 0,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--stamp)' }}>
              Permanently delete this task?
            </div>
            <div style={{ color: 'var(--ink)', fontSize: '11px', lineHeight: 1.4 }}>
              This will remove the task, linked dependencies, and all comments. This action is
              audited.
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-sm"
                style={{
                  background: 'var(--stamp)',
                  color: '#fff',
                  border: 'none',
                  padding: '4px 12px',
                }}
                onClick={handleDeleteTask}
                disabled={deletingTask}
              >
                {deletingTask ? 'Deleting…' : 'Yes, Delete Task'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowDeleteTaskConfirm(false)}
                disabled={deletingTask}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div
            style={{
              padding: 'var(--space-2) var(--space-6)',
              background: 'var(--blocked-subtle)',
              borderBottom: '1px solid var(--blocked)',
              color: 'var(--blocked)',
              fontSize: 'var(--font-size-xs)',
              flexShrink: 0,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !task && (
          <div
            style={{
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              flex: 1,
            }}
          >
            <div
              style={{ height: 32, background: 'var(--paper)', borderRadius: 'var(--radius-sm)' }}
            />
            <div
              style={{ height: 80, background: 'var(--paper)', borderRadius: 'var(--radius-sm)' }}
            />
            <div
              style={{ height: 120, background: 'var(--paper)', borderRadius: 'var(--radius-sm)' }}
            />
          </div>
        )}

        {/* Drawer Body (Scrollable beneath pinned header) */}
        {task && (
          <div
            className="modal-body-scrollable"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-6)' }}
          >
            {/* Status Selector Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-6)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--ink-muted)',
                  fontWeight: 500,
                }}
              >
                Execution Status:
              </span>
              <select
                className="input-field"
                value={(task['status'] as string) || 'backlog'}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '4px 8px',
                  fontWeight: 600,
                  width: 'auto',
                }}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="doing">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done (Verified)</option>
              </select>
            </div>

            {/* Description Section (Editable Inline) */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: '11px',
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  SPECIFICATION & SCOPE
                </span>
                {!isEditingDesc && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDesc(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--proof)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditingDesc ? (
                <div>
                  <textarea
                    className="input-field"
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    rows={4}
                    style={{ width: '100%', fontSize: 'var(--font-size-sm)', resize: 'vertical' }}
                    placeholder="Provide exact technical context, files, or execution requirements."
                  />
                  <div
                    style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}
                  >
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveDescription}
                      disabled={savingDesc}
                    >
                      {savingDesc ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setIsEditingDesc(false);
                        setDescValue((task['description'] as string) || '');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    lineHeight: 1.6,
                    color: task['description'] ? 'var(--ink)' : 'var(--ink-muted)',
                    fontStyle: task['description'] ? 'normal' : 'italic',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {(task['description'] as string) || 'No technical specification provided.'}
                </div>
              )}
            </div>

            {/* Two-Column Definition List of Metadata */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-4)',
                borderTop: '1px solid var(--rule)',
                borderBottom: '1px solid var(--rule)',
                padding: 'var(--space-4) 0',
                marginBottom: 'var(--space-6)',
              }}
            >
              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  PRIORITY
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, marginTop: 2 }}>
                  {(task['priority'] as string) || 'Normal'}
                </div>
              </div>

              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  CREATED DATE
                </div>
                <div className="font-mono" style={{ fontSize: '12px', marginTop: 2 }}>
                  {task['createdAt']
                    ? new Date(task['createdAt'] as string).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </div>
              </div>
            </div>

            {/* Activity & Comments Timeline */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: '11px',
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  TIMELINE & AUDIT COMMENTS ({comments.length})
                </span>
              </div>

              {comments.length === 0 ? (
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--ink-muted)',
                    fontStyle: 'italic',
                    margin: 0,
                  }}
                >
                  No comments logged. Add the first status update or note below.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {comments.map((cmt) => {
                    const author = (cmt['authorName'] as string) || 'Workspace member';
                    const initials = author
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        key={cmt['id'] as string}
                        style={{
                          display: 'flex',
                          gap: 'var(--space-3)',
                          alignItems: 'flex-start',
                        }}
                      >
                        {/* Initials Avatar */}
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--paper)',
                            border: '1px solid var(--rule)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--ink)',
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>

                        {/* Comment Body & Meta */}
                        <div
                          style={{
                            flex: 1,
                            background: 'var(--paper)',
                            border: '1px solid var(--rule)',
                            borderRadius: 'var(--radius-sm)',
                            padding: 'var(--space-3)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              marginBottom: 'var(--space-1)',
                              flexWrap: 'wrap',
                              gap: 'var(--space-1)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 600,
                                color: 'var(--ink)',
                              }}
                            >
                              {author}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-2)',
                              }}
                            >
                              {Boolean(cmt['editedAt']) && (
                                <span
                                  className="font-mono"
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--ink-muted)',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  (edited)
                                </span>
                              )}
                              <span
                                className="font-mono"
                                style={{ fontSize: '10px', color: 'var(--ink-muted)' }}
                              >
                                {new Date(cmt['createdAt'] as string).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </span>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '4px',
                                  marginLeft: 'var(--space-1)',
                                }}
                              >
                                {(!currentUser ||
                                  !cmt['authorId'] ||
                                  cmt['authorId'] === currentUser.id) && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{
                                      padding: '0 4px',
                                      height: 20,
                                      fontSize: '10px',
                                      color: 'var(--ink-muted)',
                                    }}
                                    onClick={() => handleStartEditComment(cmt)}
                                    title="Edit comment"
                                  >
                                    Edit
                                  </button>
                                )}
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{
                                    padding: '0 4px',
                                    height: 20,
                                    fontSize: '10px',
                                    color: 'var(--stamp)',
                                  }}
                                  onClick={() => setDeletingCommentId(cmt['id'] as string)}
                                  title="Delete comment"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>

                          {editingCommentId === cmt['id'] ? (
                            <div
                              style={{
                                marginTop: 'var(--space-2)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 'var(--space-2)',
                              }}
                            >
                              <textarea
                                className="input-field"
                                value={editCommentText}
                                onChange={(e) => setEditCommentText(e.target.value)}
                                rows={2}
                                style={{ width: '100%', fontSize: 'var(--font-size-xs)' }}
                              />
                              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleSaveCommentEdit(cmt['id'] as string)}
                                  disabled={savingCommentEdit || !editCommentText.trim()}
                                >
                                  {savingCommentEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setEditingCommentId(null)}
                                  disabled={savingCommentEdit}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : deletingCommentId === cmt['id'] ? (
                            <div
                              style={{
                                marginTop: 'var(--space-2)',
                                padding: 'var(--space-2)',
                                background: 'var(--stamp-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 'var(--space-2)',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--stamp)',
                                  fontWeight: 500,
                                }}
                              >
                                Remove comment? (Audited)
                              </span>
                              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    background: 'var(--stamp)',
                                    color: '#fff',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    border: 'none',
                                  }}
                                  onClick={() => handleDeleteComment(cmt['id'] as string)}
                                  disabled={deletingComment}
                                >
                                  {deletingComment ? '…' : 'Confirm'}
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px 6px', fontSize: '11px' }}
                                  onClick={() => setDeletingCommentId(null)}
                                  disabled={deletingComment}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                lineHeight: 1.5,
                                color: 'var(--ink)',
                              }}
                            >
                              {cmt['body'] as string}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pinned Comment Composer at Bottom */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            paddingBottom: 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid var(--rule)',
            background: 'var(--surface)',
          }}
        >
          <form
            onSubmit={handleAddComment}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            <textarea
              className="input-field"
              placeholder="Write a timeline update or audit note… (⌘+Enter to post)"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleAddComment();
                }
              }}
              rows={2}
              style={{ width: '100%', fontSize: 'var(--font-size-xs)', resize: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                PRESS ⌘+ENTER TO SUBMIT
              </span>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={postingComment || !commentText.trim()}
              >
                {postingComment ? 'Posting…' : 'Post Note'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
