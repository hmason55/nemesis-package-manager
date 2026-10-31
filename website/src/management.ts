import { api } from "./client";
import { el, heading, action, external } from "./ui";
import { statusLabels } from "./publish-view";
type Controls = {
  run: (task: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
};
export function renderManagement(
  root: HTMLElement,
  submissions: any[],
  blocks: any,
  controls: Controls,
) {
  heading(
    root,
    "Registry management",
    "Packages publish automatically after validation. Use these controls to remove broken or abusive packages and retry failed checks.",
  );
  async function change(path: string, question: string) {
    if (!confirm(question)) return;
    const reason = prompt("Reason for this action");
    if (reason === null) return;
    if (!reason.trim())
      throw new Error("Enter a reason for the registry action.");
    await api(path, { reason: reason.trim() });
    await controls.refresh();
  }
  for (const submission of submissions) {
    const data = JSON.parse(submission.metadata),
      card = el("article", "", "review-card");
    card.append(
      el("h2", submission.package_id + " " + submission.version),
      el(
        "span",
        statusLabels[submission.status] || submission.status,
        "status-badge",
      ),
      el(
        "p",
        submission.repository +
          " · " +
          (submission.publisher || "GitHub release synchronization"),
      ),
      el("p", data.description),
    );
    const report = el("details");
    report.append(
      el("summary", "Validation report and metadata"),
      el("p", submission.report || "Waiting for validation"),
      el("pre", JSON.stringify(data, null, 2), "notes"),
      el("code", submission.sha256 || "No validated artifact yet", "hash"),
      external(
        "Inspect repository",
        "https://github.com/" + submission.repository,
      ),
    );
    card.append(report);
    const actions = el("div", "", "actions");
    if (submission.status === "withdrawn")
      actions.append(
        action(
          "Republish version",
          () =>
            controls.run(() =>
              change(
                "/v1/admin/submissions/" + submission.id + "/republish",
                "Republish " +
                  submission.package_id +
                  " " +
                  submission.version +
                  " using its original validated ZIP and SHA-256? Registry downloads will become available again.",
              ),
            ),
          "quiet",
        ),
      );
    if (submission.status === "failed")
      actions.append(
        action(
          "Retry validation",
          () =>
            controls.run(() =>
              change(
                "/v1/admin/submissions/" + submission.id + "/retry",
                "Run validation again for this submission?",
              ),
            ),
          "quiet",
        ),
      );
    if (submission.status === "approved")
      actions.append(
        action(
          "Remove package",
          () =>
            controls.run(() =>
              change(
                "/v1/admin/packages/" +
                  encodeURIComponent(submission.package_id) +
                  "/remove",
                "Remove all published versions of " +
                  submission.package_id +
                  " from discovery and downloads? Existing offline copies cannot be recalled.",
              ),
            ),
          "quiet",
        ),
      );
    const owner = submission.owner_id || submission.publisher_id;
    if (owner)
      actions.append(
        action(
          "Block repository owner",
          () =>
            controls.run(() =>
              change(
                "/v1/admin/publishers/" + Number(owner) + "/block",
                "Block repository owner " +
                  submission.repository.split("/")[0] +
                  " (GitHub ID " +
                  owner +
                  ")" +
                  " from publishing packages? Pending jobs will stop. Existing published packages stay available until removed separately.",
              ),
            ),
          "quiet",
        ),
      );
    if (submission.publisher_id && submission.publisher_id !== owner)
      actions.append(
        action(
          "Block submitting user",
          () =>
            controls.run(() =>
              change(
                "/v1/admin/publishers/" +
                  Number(submission.publisher_id) +
                  "/block",
                "Block submitting user " +
                  (submission.publisher || submission.publisher_id) +
                  " from publishing? Existing published packages stay available until removed separately.",
              ),
            ),
          "quiet",
        ),
      );
    card.append(actions);
    root.append(card);
  }
  const section = el("section", "", "settings-card");
  section.append(el("h2", "Blocked publishers"));
  const records = Array.isArray(blocks)
    ? blocks
    : blocks.publishers || blocks.blocks || [];
  if (!records.length) section.append(el("p", "No publishers are blocked."));
  for (const block of records) {
    const row = el("article"),
      id = block.publisher_id || block.id;
    row.append(
      el("h3", block.login || "GitHub publisher " + id),
      el("p", block.reason || "No reason recorded"),
      action(
        "Unblock publisher",
        () =>
          controls.run(() =>
            change(
              "/v1/admin/publishers/" + Number(id) + "/unblock",
              "Allow this publisher to publish validated packages again? Previously stopped jobs will not resume automatically.",
            ),
          ),
        "quiet",
      ),
    );
    section.append(row);
  }
  root.append(section);
}
