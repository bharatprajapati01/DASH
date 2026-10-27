import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Search, Trash2, UploadCloud } from "lucide-react";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, Skeleton } from "../ui";
import { api } from "@/lib/api";
import { useFiles, useProjects } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useToast } from "@/lib/toast";
import { errMsg, fileKind, fmtDate, fmtSize } from "@/lib/format";
import type { FileItem } from "@/lib/types";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.zip";
const MAX_MB = 10; // mirrors the server default (MAX_FILE_SIZE_MB); the server is the source of truth.

/** Upload, search, download and delete project documents. Pass `projectId` to scope to one project. */
export function FilesPanel({ projectId, canManage = false }: { projectId?: string; canManage?: boolean }) {
  const { user, isAdmin } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const projects = useProjects();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState(projectId ?? "");
  const [drag, setDrag] = useState(false);
  const [toDelete, setToDelete] = useState<FileItem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const files = useFiles({ projectId, q: q.trim() || undefined });
  const destination = projectId ?? target ?? "";

  const refresh = () => {
    for (const k of ["files", "task", "activity", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dest = projectId ?? (target || projects.data?.[0]?.id);
      if (!dest) throw new Error("Create a project first, then upload files to it.");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPT.split(",").includes(`.${ext}`)) throw new Error("Only PDF, PNG, JPG, DOCX, XLSX and ZIP files are allowed.");
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Files must be ${MAX_MB} MB or smaller.`);
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/projects/${dest}/files`, fd);
    },
    onSuccess: () => {
      toast.success("File uploaded");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => {
      toast.success("File deleted");
      setToDelete(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const pick = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((f) => upload.mutate(f));
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
        className={`flex flex-wrap items-center gap-3 rounded-card border-2 border-dashed p-4 transition ${drag ? "border-coral bg-coral-light" : "border-line bg-coral-light/30"}`}
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-coral shadow-soft">
          {upload.isPending ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
        </span>
        <div className="min-w-[180px] flex-1">
          <p className="text-sm font-bold">Drop files here or browse</p>
          <p className="text-xs text-muted">PDF, PNG, JPG, DOCX, XLSX or ZIP · up to {MAX_MB} MB each</p>
        </div>
        {!projectId && (
          <select className="input !w-auto" aria-label="Upload to project" value={destination} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{projects.data?.[0] ? `${projects.data[0].name} (default)` : "No projects"}</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} />
        <button className="btn-primary" onClick={() => input.current?.click()} disabled={upload.isPending}>Choose files</button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Search files" aria-label="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {files.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : files.isError ? (
        <ErrorState message={(files.error as Error).message} onRetry={() => files.refetch()} />
      ) : files.data && files.data.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title={q ? "No files match your search" : "No files yet"} hint={q ? undefined : "Upload a brief, mockup or spreadsheet to share it with the team."} />
      ) : (
        <div className="overflow-hidden rounded-card border border-line">
          <table className="w-full text-left text-sm">
            <thead className="hidden bg-coral-light/60 text-xs uppercase tracking-wide text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-3 font-bold">Name</th>
                <th className="px-3 py-3 font-bold">Type</th>
                <th className="px-3 py-3 font-bold">Uploaded by</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">Size</th>
                {!projectId && <th className="px-3 py-3 font-bold">Project</th>}
                <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {files.data?.map((f) => (
                <tr key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:table-row md:px-0 md:py-0 hover:bg-coral-light/30">
                  <td className="md:px-4 md:py-3">
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold" style={{ background: f.project?.color ?? "#FFF0EB" }}>{fileKind(f.fileName)}</span>
                      <span className="min-w-0">
                        <span className="block max-w-[260px] truncate font-bold">{f.fileName}</span>
                        {f.task && <span className="block max-w-[260px] truncate text-xs text-muted">on {f.task.title}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-muted md:table-cell">{fileKind(f.fileName)}</td>
                  <td className="text-xs md:px-3 md:py-3 md:text-sm">
                    <span className="flex items-center gap-2"><Avatar name={f.uploadedBy.name} avatar={f.uploadedBy.avatar} size={22} />{f.uploadedBy.name}</span>
                  </td>
                  <td className="text-xs text-muted md:px-3 md:py-3 md:text-sm">{fmtDate(f.createdAt, true)}</td>
                  <td className="text-xs text-muted md:px-3 md:py-3 md:text-sm">{fmtSize(f.fileSize)}</td>
                  {!projectId && <td className="text-xs md:px-3 md:py-3 md:text-sm">{f.project?.name}</td>}
                  <td className="ml-auto md:px-3 md:py-3">
                    <span className="flex justify-end gap-1">
                      <a href={`/api/files/${f.id}/download`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-coral-light" aria-label={`Download ${f.fileName}`} title="Download">
                        <Download size={16} />
                      </a>
                      {(f.uploadedBy.id === user.id || canManage || isAdmin) && (
                        <button onClick={() => setToDelete(f)} className="grid h-9 w-9 place-items-center rounded-full text-danger hover:bg-danger/10" aria-label={`Delete ${f.fileName}`} title="Delete">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete file?"
        message={`“${toDelete?.fileName}” will be removed for everyone on the project. This can't be undone.`}
        busy={remove.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}
