import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

const DAY = 86_400_000;
const at = (offsetDays: number, hour = 12) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return new Date(d.getTime() + offsetDays * DAY);
};

type Status = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

async function main() {
  // Re-runnable: wipe demo data first (children before parents).
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.workspaceMember.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash("Password123", 12);
  const mk = (name: string, email: string, jobTitle: string, avatar: string, lastActiveMinsAgo: number) =>
    prisma.user.create({
      data: { name, email, jobTitle, avatar, passwordHash, lastActiveAt: new Date(Date.now() - lastActiveMinsAgo * 60_000) },
    });

  const alex = await mk("Alex Morgan", "alex@fibnk.dev", "Product Lead", "#FF896D", 1);
  const priya = await mk("Priya Sharma", "priya@fibnk.dev", "UI/UX Designer", "#D9D1FF", 12);
  const marco = await mk("Marco Rossi", "marco@fibnk.dev", "3D Artist", "#C7FF24", 55);
  const lena = await mk("Lena Fischer", "lena@fibnk.dev", "Frontend Engineer", "#FFE735", 240);
  const sam = await mk("Sam Okafor", "sam@fibnk.dev", "Motion Designer", "#DDF4FF", 1500);

  const ws = await prisma.workspace.create({
    data: {
      name: "FIBNK Studio",
      ownerId: alex.id,
      members: {
        create: [
          { userId: alex.id, role: "ADMIN" },
          { userId: priya.id, role: "MEMBER" },
          { userId: marco.id, role: "MEMBER" },
          { userId: lena.id, role: "MEMBER" },
          { userId: sam.id, role: "MEMBER" },
        ],
      },
    },
  });

  const mkProject = (
    name: string,
    category: string,
    color: string,
    description: string,
    ownerId: string,
    memberIds: string[],
    startOffset: number,
    dueOffset: number,
  ) =>
    prisma.project.create({
      data: {
        name,
        category,
        color,
        description,
        workspaceId: ws.id,
        ownerId,
        status: "ACTIVE",
        startDate: at(startOffset),
        dueDate: at(dueOffset),
        members: {
          create: [{ userId: ownerId, role: "OWNER" }, ...memberIds.filter((m) => m !== ownerId).map((userId) => ({ userId, role: "MEMBER" as const }))],
        },
      },
    });

  const appUi = await mkProject("App UI/UX", "Design", "#FF896D", "Smart Bike companion app: onboarding, ride tracking and the garage experience.", priya.id, [alex.id, lena.id, sam.id], -30, 21);
  const threeD = await mkProject("3D Design", "3D", "#D9D1FF", "Product renders and turntable assets for the Smart Bike launch.", marco.id, [alex.id, sam.id], -20, 14);
  const web = await mkProject("Website Design", "Web", "#FFE735", "Marketing site with a live ride map and pre-order flow.", lena.id, [alex.id, priya.id, marco.id], -25, 28);
  const motion = await mkProject("Motion Design", "Motion", "#C7FF24", "Launch teaser, in-app micro-interactions and social cut-downs.", sam.id, [alex.id, priya.id], -10, 35);

  type T = [string, string, Status, Priority, string | null, number | null, number | null, string[]];
  const mkTasks = async (projectId: string, creator: string, rows: T[]) => {
    let pos = 1000;
    const out = [];
    for (const [title, description, status, priority, assigneeId, startOff, dueOff, labels] of rows) {
      out.push(
        await prisma.task.create({
          data: {
            title,
            description,
            projectId,
            createdById: creator,
            assigneeId,
            status,
            priority,
            labels,
            position: pos,
            startDate: startOff === null ? null : at(startOff),
            dueDate: dueOff === null ? null : at(dueOff),
            completedAt: status === "DONE" ? at((dueOff ?? 0) - 1) : null,
            createdAt: at(-14 + Math.floor(pos / 1000)),
          },
        }),
      );
      pos += 1000;
    }
    return out;
  };

  const appTasks = await mkTasks(appUi.id, priya.id, [
    ["New Brief", "Write and share the project brief for the Smart Bike companion app.", "DONE", "HIGH", priya.id, -28, -24, ["brief"]],
    ["User research summary", "Summarise findings from the 12 rider interviews.", "DONE", "MEDIUM", alex.id, -22, -16, ["research"]],
    ["Onboarding flow wireframes", "Low-fi wireframes for first-run, permissions and bike pairing.", "DONE", "HIGH", priya.id, -18, -9, ["wireframe"]],
    ["Smart Bike App: ride screen", "High-fidelity ride tracking screen with live metrics and map.", "IN_PROGRESS", "URGENT", priya.id, -6, 1, ["hi-fi", "ride"]],
    ["Design system tokens", "Export colors, spacing and type tokens for engineering.", "IN_PROGRESS", "MEDIUM", lena.id, -4, 5, ["system"]],
    ["Garage screen review", "Design review for the garage and maintenance screen.", "IN_REVIEW", "MEDIUM", alex.id, -5, 2, ["review"]],
    ["Accessibility audit", "Check contrast, tap targets and dynamic type across key screens.", "TODO", "HIGH", sam.id, null, 9, ["a11y"]],
    ["Empty and error states", "Design the empty, offline and error states.", "TODO", "LOW", priya.id, null, 14, []],
  ]);

  const threeTasks = await mkTasks(threeD.id, marco.id, [
    ["Model frame and wheels", "Base hard-surface model for the Smart Bike.", "DONE", "HIGH", marco.id, -18, -10, ["model"]],
    ["Materials and textures", "PBR materials for frame, tires and display.", "IN_PROGRESS", "HIGH", marco.id, -8, 0, ["texture"]],
    ["Turntable render", "360-degree turntable at 4K for the website hero.", "TODO", "MEDIUM", sam.id, null, 7, ["render"]],
    ["Exploded view", "Exploded view of battery and drive unit.", "TODO", "LOW", marco.id, null, 12, []],
    ["Team Meeting: asset review", "Review renders with design and web before handoff.", "TODO", "MEDIUM", alex.id, 2, 3, ["meeting"]],
  ]);

  const webTasks = await mkTasks(web.id, lena.id, [
    ["Sitemap and page inventory", "Agree the page list and navigation.", "DONE", "MEDIUM", alex.id, -22, -15, ["ia"]],
    ["Hero section build", "Responsive hero with video background and CTA.", "IN_REVIEW", "HIGH", lena.id, -9, 1, ["frontend"]],
    ["Pre-order checkout", "Stripe-ready checkout with address validation.", "IN_PROGRESS", "URGENT", lena.id, -5, 4, ["checkout"]],
    ["Live ride map", "Embed anonymised community ride map.", "TODO", "MEDIUM", marco.id, null, 16, ["map"]],
    ["Project Details copy", "Final product copy and specs table.", "TODO", "LOW", priya.id, null, 8, ["content"]],
    ["Launch checklist", "Performance, SEO and analytics sign-off.", "TODO", "HIGH", alex.id, null, 26, []],
  ]);

  const motionTasks = await mkTasks(motion.id, sam.id, [
    ["Teaser storyboard", "Storyboard the 30-second launch teaser.", "DONE", "MEDIUM", sam.id, -9, -4, ["storyboard"]],
    ["Animatic", "Rough timing pass with temp music.", "IN_PROGRESS", "MEDIUM", sam.id, -3, 6, []],
    ["Micro-interaction library", "Lottie set for buttons, toggles and ride-start.", "TODO", "HIGH", priya.id, null, 15, ["lottie"]],
    ["Social cut-downs", "Vertical and square edits of the teaser.", "TODO", "LOW", sam.id, null, 30, []],
  ]);

  // Comments and mentions on a few tasks.
  const ride = appTasks[3]!;
  const c1 = await prisma.comment.create({
    data: { taskId: ride.id, userId: alex.id, content: "Can we show the elevation profile under the map? Riders keep asking for it.", createdAt: new Date(Date.now() - 6 * 3600_000) },
  });
  await prisma.comment.create({
    data: { taskId: ride.id, userId: priya.id, parentCommentId: c1.id, content: "Yes. I'll sketch two options and share them this afternoon. @Lena Fischer can the chart library handle this?", createdAt: new Date(Date.now() - 5 * 3600_000) },
  });
  await prisma.comment.create({
    data: { taskId: ride.id, userId: lena.id, parentCommentId: c1.id, content: "Should be fine, we already use it for the stats screen.", createdAt: new Date(Date.now() - 3 * 3600_000) },
  });
  await prisma.comment.create({
    data: { taskId: webTasks[2]!.id, userId: lena.id, content: "Address validation is done. Waiting on the payment keys from @Alex Morgan.", createdAt: new Date(Date.now() - 2 * 3600_000) },
  });
  await prisma.comment.create({
    data: { taskId: threeTasks[1]!.id, userId: marco.id, content: "Tire tread normal map is baked. Moving on to the display emissive.", createdAt: new Date(Date.now() - 26 * 3600_000) },
  });

  // Activity feed.
  const act = (userId: string, projectId: string, taskId: string | null, action: string, details: string, hoursAgo: number) =>
    prisma.activity.create({ data: { userId, projectId, taskId, action, details, createdAt: new Date(Date.now() - hoursAgo * 3600_000) } });
  await act(priya.id, appUi.id, null, "project.created", 'created the project "App UI/UX"', 24 * 30);
  await act(marco.id, threeD.id, null, "project.created", 'created the project "3D Design"', 24 * 20);
  await act(priya.id, appUi.id, appTasks[2]!.id, "task.completed", 'completed "Onboarding flow wireframes"', 24 * 9);
  await act(alex.id, appUi.id, ride.id, "task.assigned", 'assigned "Smart Bike App: ride screen"', 30);
  await act(alex.id, appUi.id, ride.id, "comment.added", 'commented on "Smart Bike App: ride screen"', 6);
  await act(lena.id, web.id, webTasks[2]!.id, "comment.added", 'commented on "Pre-order checkout"', 2);
  await act(lena.id, web.id, webTasks[1]!.id, "task.status", 'moved "Hero section build" to In Review', 5);
  await act(sam.id, motion.id, motionTasks[0]!.id, "task.completed", 'completed "Teaser storyboard"', 96);
  await act(marco.id, threeD.id, threeTasks[0]!.id, "task.completed", 'completed "Model frame and wheels"', 24 * 10);
  await act(alex.id, motion.id, null, "member.joined", "was added to Motion Design", 24 * 9);

  // Notifications for the demo user (Alex) so the bell is populated.
  const note = (userId: string, type: string, message: string, projectId: string, taskId: string | null, hoursAgo: number, isRead = false) =>
    prisma.notification.create({
      data: { userId, type: type as never, message, relatedProjectId: projectId, relatedTaskId: taskId, isRead, createdAt: new Date(Date.now() - hoursAgo * 3600_000) },
    });
  await note(alex.id, "MENTION", 'Lena Fischer mentioned you on "Pre-order checkout"', web.id, webTasks[2]!.id, 2);
  await note(alex.id, "STATUS_CHANGE", '"Hero section build" moved to In Review', web.id, webTasks[1]!.id, 5);
  await note(alex.id, "TASK_ASSIGNED", 'You were assigned "Garage screen review" in App UI/UX', appUi.id, appTasks[5]!.id, 28);
  await note(alex.id, "DEADLINE_SOON", '"Garage screen review" is due within 24 hours', appUi.id, appTasks[5]!.id, 1);
  await note(alex.id, "PROJECT_INVITE", 'You were added to the project "Motion Design"', motion.id, null, 24 * 9, true);
  await note(priya.id, "COMMENT", 'Alex Morgan commented on "Smart Bike App: ride screen"', appUi.id, ride.id, 6);

  console.log("Seeded. Sign in with alex@fibnk.dev / Password123 (all demo users share that password).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
