import { DraftWorkspace } from "@/app/components/draft-workspace";
import { ReviewPanel } from "@/app/components/review-panel";
import { PublicationForm } from "@/app/components/publication-form";
import { LearningPanel } from "@/app/components/learning-panel";
import { createAppDesk } from "@/server/create-app-desk";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const activeStyle = createWorkspaceDataStore().getActiveStyleProfile();
  const proposal = dashboard.latestProposal;
  const draft = dashboard.latestPlatformDraft?.proposalId === proposal?.operationId ? dashboard.latestPlatformDraft : undefined;
  const publication = dashboard.latestPublication?.proposalId === proposal?.operationId ? dashboard.latestPublication : undefined;
  return <section className="page-stack"><header className="page-heading"><h2>内容草稿</h2><span className={activeStyle ? "state state-ready" : "state"}>{activeStyle ? `风格版本 ${activeStyle.version}` : "使用基础风格"}</span></header><DraftWorkspace draft={draft} proposal={proposal} />{proposal && draft?.validation.valid && proposal.status === "awaiting_review" ? <section className="surface workflow-section"><ReviewPanel proposalId={proposal.operationId} version={proposal.version} /></section> : null}{proposal && draft && proposal.status === "approved_unpublished" && !publication ? <section className="surface workflow-section"><PublicationForm mode={proposal.synthetic ? "demo" : "real"} platform={draft.platform} proposalId={proposal.operationId} proposalVersion={proposal.version} suggestedText={draft.body} /></section> : null}{publication ? <section className="surface workflow-section" id="creator-memory"><LearningPanel learning={dashboard.latestLearning} mindConnected={dashboard.systemStatus.mind.state === "connected"} publicationId={publication.operationId} publicationMode={publication.mode} /></section> : null}</section>;
}
