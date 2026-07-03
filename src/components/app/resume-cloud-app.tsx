"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { formatDistanceToNow } from "date-fns";
import JSZip from "jszip";
import {
  Download,
  FilePlus2,
  FileText,
  LayoutPanelTop,
  LetterText,
  LogOut,
  Mail,
  Moon,
  Printer,
  Save,
  SplitSquareHorizontal,
  Sun,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast, Toaster } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createHtmlExport, parseDocument } from "@/lib/markdown";
import { SAMPLE_DOCUMENTS } from "@/lib/sample-data";
import type { DocumentKind, ParsedDocument, StoredDocument, ThemeId } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_DOCUMENTS_PER_KIND = 25;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024;

type ViewMode = "split" | "edit" | "preview";
type AppTheme = "light" | "dark";

type UserWorkspace = {
  id: string;
  email: string;
  documents: StoredDocument[];
  selectedId: string;
  createdAt: string;
};

type StoreState = {
  hydrated: boolean;
  currentUserId: string | null;
  users: Record<string, UserWorkspace>;
  markHydrated: () => void;
  enterWithEmail: (email: string) => string;
  signOut: () => void;
  setSelectedId: (userId: string, documentId: string) => void;
  createDocument: (userId: string, kind: DocumentKind) => StoredDocument | null;
  saveDocument: (
    userId: string,
    documentId: string,
    patch: Pick<StoredDocument, "name" | "content" | "themeId">,
  ) => { ok: true } | { ok: false; error: string };
};

const useResumeCloudStore = create<StoreState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      currentUserId: null,
      users: {},
      markHydrated: () => set({ hydrated: true }),
      enterWithEmail: (email) => {
        const normalizedEmail = normalizeEmail(email);
        const userId = createUserId(normalizedEmail);
        const existingUser = get().users[userId];

        set((state) => ({
          currentUserId: userId,
          users: existingUser
            ? state.users
            : {
                ...state.users,
                [userId]: {
                  id: userId,
                  email: normalizedEmail,
                  documents: cloneSampleDocuments(),
                  selectedId: SAMPLE_DOCUMENTS[0].id,
                  createdAt: new Date().toISOString(),
                },
              },
        }));

        return userId;
      },
      signOut: () => set({ currentUserId: null }),
      setSelectedId: (userId, documentId) =>
        set((state) => ({
          users: {
            ...state.users,
            [userId]: {
              ...state.users[userId],
              selectedId: documentId,
            },
          },
        })),
      createDocument: (userId, kind) => {
        const user = get().users[userId];
        if (!user) {
          return null;
        }

        const count = user.documents.filter((document) => document.kind === kind).length;
        if (count >= MAX_DOCUMENTS_PER_KIND) {
          return null;
        }

        const timestamp = new Date().toISOString();
        const document: StoredDocument = {
          id: `${kind}-${crypto.randomUUID()}`,
          kind,
          name: kind === "resume" ? "New Resume" : "New Cover Letter",
          content: kind === "resume" ? resumeTemplate() : coverLetterTemplate(),
          themeId: kind === "resume" ? "signal" : "paper",
          createdAt: timestamp,
          updatedAt: timestamp,
          lastSavedAt: timestamp,
        };

        set((state) => ({
          users: {
            ...state.users,
            [userId]: {
              ...state.users[userId],
              selectedId: document.id,
              documents: [document, ...state.users[userId].documents],
            },
          },
        }));

        return document;
      },
      saveDocument: (userId, documentId, patch) => {
        const size = new TextEncoder().encode(patch.content).length;
        if (size > MAX_DOCUMENT_SIZE_BYTES) {
          return {
            ok: false,
            error: `This document is ${formatBytes(size)}. The current limit is ${formatBytes(
              MAX_DOCUMENT_SIZE_BYTES,
            )}.`,
          };
        }

        const timestamp = new Date().toISOString();
        set((state) => ({
          users: {
            ...state.users,
            [userId]: {
              ...state.users[userId],
              documents: state.users[userId].documents
                .map((document) =>
                  document.id === documentId
                    ? {
                        ...document,
                        ...patch,
                        updatedAt: timestamp,
                        lastSavedAt: timestamp,
                      }
                    : document,
                )
                .sort((a, b) => b.lastSavedAt.localeCompare(a.lastSavedAt)),
            },
          },
        }));

        return { ok: true };
      },
    }),
    {
      name: "resume-cloud-store",
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

const THEMES: Array<{
  id: ThemeId;
  label: string;
  description: string;
}> = [
  { id: "signal", label: "Signal", description: "Bold modern cards with strong section rhythm." },
  { id: "paper", label: "Paper", description: "Warm editorial layout with serif typography." },
  { id: "executive", label: "Executive", description: "Structured, crisp, and ATS-friendly." },
];

export function ResumeCloudApp() {
  const {
    hydrated,
    currentUserId,
    users,
    enterWithEmail,
    signOut,
    setSelectedId,
    createDocument,
    saveDocument,
  } = useResumeCloudStore();
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    const storedTheme = window.localStorage.getItem("resume-cloud-app-theme");
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
  });
  const [email, setEmail] = useState("");
  const currentUser = currentUserId ? users[currentUserId] ?? null : null;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", appTheme === "dark");
    window.localStorage.setItem("resume-cloud-app-theme", appTheme);
  }, [appTheme]);

  if (!hydrated) {
    return <div className="min-h-screen bg-[var(--app-background)]" />;
  }

  if (!currentUser) {
    return (
      <>
        <Toaster richColors position="top-right" />
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.22),_transparent_28%),linear-gradient(180deg,_var(--app-background),_var(--app-background))] px-6 text-slate-900 dark:text-slate-100">
          <div className="w-full max-w-xl rounded-[2rem] border border-black/5 bg-white/85 p-8 shadow-[0_30px_100px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600 dark:text-orange-300">
                  ResumeCloud
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  Enter your email and start editing.
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setAppTheme((theme) => (theme === "dark" ? "light" : "dark"))}
                className="rounded-2xl border border-black/5 bg-white p-3 text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {appTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </div>

            <p className="mb-6 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-300">
              No homepage. No marketing funnel. No login flow yet. We just use your email address
              to generate a unique local user id so you can get right into the builder.
            </p>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isValidEmail(email)) {
                  toast.error("Enter a valid email address");
                  return;
                }

                enterWithEmail(email);
                toast.success("Workspace ready");
              }}
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Email address</span>
                <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-900/80">
                  <Mail className="size-4 text-slate-400" />
                  <input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Open Resume Builder
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <Workspace
      appTheme={appTheme}
      currentUser={currentUser}
      onThemeToggle={() => setAppTheme((theme) => (theme === "dark" ? "light" : "dark"))}
      onSignOut={signOut}
      onSelectDocument={(documentId) => setSelectedId(currentUser.id, documentId)}
      onCreateDocument={(kind) => createDocument(currentUser.id, kind)}
      onSaveDocument={(documentId, patch) => saveDocument(currentUser.id, documentId, patch)}
    />
  );
}

function Workspace({
  appTheme,
  currentUser,
  onThemeToggle,
  onSignOut,
  onSelectDocument,
  onCreateDocument,
  onSaveDocument,
}: {
  appTheme: AppTheme;
  currentUser: UserWorkspace;
  onThemeToggle: () => void;
  onSignOut: () => void;
  onSelectDocument: (documentId: string) => void;
  onCreateDocument: (kind: DocumentKind) => StoredDocument | null;
  onSaveDocument: (
    documentId: string,
    patch: Pick<StoredDocument, "name" | "content" | "themeId">,
  ) => { ok: true } | { ok: false; error: string };
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const selectedDocument =
    currentUser.documents.find((document) => document.id === currentUser.selectedId) ??
    currentUser.documents[0] ??
    null;
  const resumes = currentUser.documents.filter((document) => document.kind === "resume");
  const coverLetters = currentUser.documents.filter((document) => document.kind === "cover-letter");

  if (!selectedDocument) {
    return null;
  }

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.18),_transparent_24%),linear-gradient(180deg,_var(--app-background),_var(--app-background))] text-slate-900 transition-colors dark:text-slate-100">
        <aside className="hidden w-[300px] border-r border-black/5 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60 lg:flex lg:flex-col">
          <div className="mb-4 rounded-3xl border border-black/5 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600 dark:text-orange-300">
                  ResumeCloud
                </p>
                <h1 className="mt-2 text-lg font-semibold">Resume builder</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{currentUser.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onThemeToggle}
                  className="rounded-2xl border border-black/5 bg-white p-2 text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  {appTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="rounded-2xl border border-black/5 bg-white p-2 text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Straight into the editor. Your current drafts are scoped to this email-based local workspace.
            </p>
          </div>

          <SidebarSection
            title="Resumes"
            count={resumes.length}
            onAdd={() => {
              const created = onCreateDocument("resume");
              if (!created) {
                toast.error("Resume limit reached");
              }
            }}
          >
            {resumes.map((document) => (
              <DocumentListItem
                key={document.id}
                document={document}
                active={document.id === selectedDocument.id}
                onSelect={() => onSelectDocument(document.id)}
              />
            ))}
          </SidebarSection>

          <SidebarSection
            title="Cover Letters"
            count={coverLetters.length}
            onAdd={() => {
              const created = onCreateDocument("cover-letter");
              if (!created) {
                toast.error("Cover letter limit reached");
              }
            }}
          >
            {coverLetters.map((document) => (
              <DocumentListItem
                key={document.id}
                document={document}
                active={document.id === selectedDocument.id}
                onSelect={() => onSelectDocument(document.id)}
              />
            ))}
          </SidebarSection>
        </aside>

        <EditorWorkspace
          key={`${currentUser.id}:${selectedDocument.id}`}
          appTheme={appTheme}
          selectedDocument={selectedDocument}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSaveDocument={onSaveDocument}
        />
      </div>
    </>
  );
}

function EditorWorkspace({
  appTheme,
  selectedDocument,
  viewMode,
  onViewModeChange,
  onSaveDocument,
}: {
  appTheme: AppTheme;
  selectedDocument: StoredDocument;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSaveDocument: (
    documentId: string,
    patch: Pick<StoredDocument, "name" | "content" | "themeId">,
  ) => { ok: true } | { ok: false; error: string };
}) {
  const [draftName, setDraftName] = useState(selectedDocument.name);
  const [draftContent, setDraftContent] = useState(selectedDocument.content);
  const [draftThemeId, setDraftThemeId] = useState<ThemeId>(selectedDocument.themeId);
  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty =
    draftName !== selectedDocument.name ||
    draftContent !== selectedDocument.content ||
    draftThemeId !== selectedDocument.themeId;

  const parsedPreview = useMemo(
    () => parseDocument(draftContent, selectedDocument.kind),
    [draftContent, selectedDocument.kind],
  );

  const handleSave = useCallback(
    (silent = false) => {
      if (!isDirty) {
        return;
      }

      setIsSaving(true);
      const result = onSaveDocument(selectedDocument.id, {
        name: draftName.trim() || fallbackName(selectedDocument.kind),
        content: draftContent,
        themeId: draftThemeId,
      });

      setIsSaving(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (!silent) {
        toast.success("Saved locally");
      }
    },
    [draftContent, draftName, draftThemeId, isDirty, onSaveDocument, selectedDocument.id, selectedDocument.kind],
  );

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      handleSave(true);
    }, 5000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [draftContent, draftName, draftThemeId, handleSave, isDirty]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  async function handleDownload() {
    const result = onSaveDocument(selectedDocument.id, {
      name: draftName.trim() || fallbackName(selectedDocument.kind),
      content: draftContent,
      themeId: draftThemeId,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const zip = new JSZip();
    const slug = slugify(draftName || fallbackName(selectedDocument.kind));
    const html = await createHtmlExport(draftName, draftContent, draftThemeId);
    const folder =
      selectedDocument.kind === "resume" ? zip.folder("resumes") : zip.folder("cover-letters");

    folder?.file(`${slug}.md`, draftContent);
    folder?.file(`${slug}.html`, html);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-black/5 bg-white/70 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60 lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-black/5 bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300">
              {selectedDocument.kind === "resume" ? "Resume" : "Cover Letter"}
            </div>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="min-w-[240px] rounded-2xl border border-black/5 bg-white px-4 py-2 text-sm font-medium shadow-sm outline-none transition focus:border-orange-300 dark:border-white/10 dark:bg-slate-900"
            />
            <select
              value={draftThemeId}
              onChange={(event) => setDraftThemeId(event.target.value as ThemeId)}
              className="rounded-2xl border border-black/5 bg-white px-4 py-2 text-sm shadow-sm outline-none transition focus:border-orange-300 dark:border-white/10 dark:bg-slate-900"
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentButton
              active={viewMode === "edit"}
              label="Edit"
              icon={<FileText className="size-4" />}
              onClick={() => onViewModeChange("edit")}
            />
            <SegmentButton
              active={viewMode === "split"}
              label="Split"
              icon={<SplitSquareHorizontal className="size-4" />}
              onClick={() => onViewModeChange("split")}
            />
            <SegmentButton
              active={viewMode === "preview"}
              label="Preview"
              icon={<LayoutPanelTop className="size-4" />}
              onClick={() => onViewModeChange("preview")}
            />
            <ActionButton disabled={!isDirty} onClick={() => handleSave(false)} icon={<Save className="size-4" />}>
              Save
            </ActionButton>
            <ActionButton onClick={() => window.print()} icon={<Printer className="size-4" />}>
              Print
            </ActionButton>
            <ActionButton onClick={handleDownload} icon={<Download className="size-4" />}>
              Download
            </ActionButton>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{themeLabel(draftThemeId)}</span>
          <span>{saveStateLabel(isSaving, isDirty, selectedDocument.lastSavedAt)}</span>
          <span>{formatBytes(new TextEncoder().encode(draftContent).length)} / 10 KB</span>
        </div>
      </header>

      <div className="grid flex-1 gap-px bg-black/5 dark:bg-white/10 lg:grid-cols-[1.05fr_0.95fr]">
        {(viewMode === "edit" || viewMode === "split") && (
          <section className={panelClassName(viewMode !== "split")}>
            <div className="border-b border-black/5 px-4 py-3 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                Markdown
              </p>
            </div>
            <div className="h-[calc(100vh-11rem)] overflow-hidden">
              <CodeMirror
                value={draftContent}
                height="100%"
                theme={appTheme === "dark" ? oneDark : "light"}
                extensions={[markdown()]}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLineGutter: false,
                }}
                onChange={(value) => setDraftContent(value)}
              />
            </div>
          </section>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <section className={panelClassName(viewMode !== "split")}>
            <div className="border-b border-black/5 px-4 py-3 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                Live Preview
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {THEMES.find((theme) => theme.id === draftThemeId)?.description}
              </p>
            </div>
            <div className="h-[calc(100vh-11rem)] overflow-auto p-6">
              <ResumePreview
                parsed={parsedPreview}
                themeId={draftThemeId}
                kind={selectedDocument.kind}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function SidebarSection({
  title,
  count,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-3xl border border-black/5 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{count} documents</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-2xl border border-black/5 bg-white p-2 text-slate-600 transition hover:bg-orange-50 hover:text-orange-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <FilePlus2 className="size-4" />
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DocumentListItem({
  document,
  active,
  onSelect,
}: {
  document: StoredDocument;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border px-3 py-3 text-left transition",
        active
          ? "border-orange-300 bg-orange-50 shadow-sm dark:border-orange-400/40 dark:bg-orange-500/10"
          : "border-transparent bg-slate-50 hover:border-black/5 hover:bg-white dark:bg-slate-800/70 dark:hover:border-white/10 dark:hover:bg-slate-800",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{document.name}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatDistanceToNow(new Date(document.lastSavedAt), { addSuffix: true })}
          </p>
        </div>
        {document.kind === "resume" ? (
          <FileText className="mt-0.5 size-4 text-slate-400" />
        ) : (
          <LetterText className="mt-0.5 size-4 text-slate-400" />
        )}
      </div>
    </button>
  );
}

function SegmentButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition",
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ActionButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {icon}
      {children}
    </button>
  );
}

function ResumePreview({
  parsed,
  themeId,
  kind,
}: {
  parsed: ParsedDocument;
  themeId: ThemeId;
  kind: DocumentKind;
}) {
  const wrapperClassName =
    themeId === "paper"
      ? "preview-paper"
      : themeId === "executive"
        ? "preview-executive"
        : "preview-signal";

  return (
    <article className={cn("preview-shell", wrapperClassName)}>
      <header className="preview-header">
        <div>
          <h1>{parsed.title}</h1>
          {kind === "resume" ? (
            <div className="preview-intro">
              {parsed.introLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="preview-body">
        {parsed.sections.map((section) => (
          <section key={section.title} className="preview-section">
            <h2>{section.title}</h2>
            {section.body ? (
              <MarkdownBlock className="preview-copy" content={section.body} />
            ) : null}
            {section.entries.length > 0 ? (
              <div className="preview-entries">
                {section.entries.map((entry) => (
                  <article key={entry.title} className="preview-entry">
                    <h3>{entry.title}</h3>
                    <MarkdownBlock className="preview-copy" content={entry.body} />
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}

function MarkdownBlock({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function panelClassName(fullWidth: boolean) {
  return cn(
    "overflow-hidden bg-white/85 backdrop-blur-xl dark:bg-slate-950/70",
    fullWidth && "lg:col-span-2",
  );
}

function fallbackName(kind: DocumentKind) {
  return kind === "resume" ? "Untitled Resume" : "Untitled Cover Letter";
}

function themeLabel(themeId: ThemeId) {
  return THEMES.find((theme) => theme.id === themeId)?.label ?? themeId;
}

function saveStateLabel(isSaving: boolean, isDirty: boolean, lastSavedAt: string) {
  if (isSaving) {
    return "Saving...";
  }
  if (isDirty) {
    return "Unsaved changes";
  }

  return `Saved ${formatDistanceToNow(new Date(lastSavedAt), { addSuffix: true })}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /\S+@\S+\.\S+/.test(normalizeEmail(email));
}

function createUserId(email: string) {
  let hash = 5381;

  for (const char of email) {
    hash = (hash * 33) ^ char.charCodeAt(0);
  }

  return `user_${(hash >>> 0).toString(36)}`;
}

function cloneSampleDocuments() {
  return SAMPLE_DOCUMENTS.map((document) => ({ ...document }));
}

function resumeTemplate() {
  return `# Your Name

Your Headline
City, State
email@example.com
portfolio-or-link

## Summary

Write a short summary of the kind of work you do and the roles you are targeting.

## Experience

### Job Title, Company
2023 - Present | Location

- Add impact-focused bullet points.
- Keep them short, specific, and measurable when possible.

## Projects

### Project Name

- Describe what you built and why it matters.

## Skills

TypeScript, React, Product Thinking
`;
}

function coverLetterTemplate() {
  return `# Cover Letter for Company Name

July 3, 2026

Hiring Manager
Company Name

Dear Hiring Manager,

Write a short opening paragraph about why this role matters to you.

Add a middle paragraph connecting your experience to the role.

Close with a warm, direct final paragraph.

Sincerely,

Your Name
`;
}
