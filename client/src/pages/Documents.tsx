import { PageHeader } from "@/components/ui";
import { FilesPanel } from "@/components/files/FilesPanel";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader title="Documents" subtitle="Briefs, mockups and files from every project you can see." />
      <div className="card p-4 sm:p-5">
        <FilesPanel />
      </div>
    </div>
  );
}
