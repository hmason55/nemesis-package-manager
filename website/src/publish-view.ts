import { api, compatibility } from "./client";
import {
  el,
  option,
  action,
  link,
  external,
  heading,
  inputField,
  selectField,
  checkField,
  size,
} from "./ui";
export const statusLabels: Record<string, string> = {
  queued: "Waiting for validation",
  validating: "Validation in progress",
  review: "Awaiting maintainer review",
  approved: "Published",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
  failed: "Validation failed",
};
interface Controls {
  run: (task: () => Promise<unknown>) => Promise<void>;
  notify: (text: string, error?: boolean) => void;
  active: () => boolean;
  signin: () => Promise<void>;
  refresh: () => Promise<void>;
}
export async function renderPublish(
  root: HTMLElement,
  user: any,
  controls: Controls,
) {
  heading(
    root,
    "Publish a package",
    "Connect your GitHub repository, choose an installer release, then review the package before submitting it.",
  );
  if (!user) {
    const intro = el("div", "", "signin-panel");
    intro.append(
      el("h2", "Publish with your GitHub account"),
      el(
        "p",
        "You need write, maintain, or admin access to a public repository and permission to redistribute its releases.",
      ),
      action(
        "Sign in with GitHub",
        () => controls.run(controls.signin),
        "primary",
      ),
      el(
        "p",
        "An account is only needed to publish. Anyone can browse and download packages.",
        "hint",
      ),
    );
    root.append(intro);
    return;
  }
  const [repos, submissions, events] = await Promise.all([
    api("/v1/publisher/repositories"),
    api("/v1/publisher/submissions"),
    api("/v1/publisher/events"),
  ]);
  if (!controls.active()) return;
  const connect = el("details", "", "connect-panel");
  connect.open = !repos.length;
  connect.append(
    el(
      "summary",
      repos.length
        ? "Connect another repository"
        : "Start by connecting your repository",
    ),
    el(
      "p",
      "Install the NEMESIS GitHub App on your repository, then return to this tab to register it.",
    ),
    external("Connect repository on GitHub", user.installation_url),
  );
  const registration = el("form");
  const repository = inputField(
    registration,
    "Public repository",
    "repository",
    "text",
    "",
    "Use owner/repository, for example yourname/vehicle-utility.",
  );
  repository.required = true;
  const consent = checkField(
    registration,
    "I have permission to redistribute this repository’s release packages through Cloudflare.",
  );
  consent.required = true;
  registration.append(el("button", "Register repository", "primary"));
  registration.onsubmit = (event) => {
    event.preventDefault();
    void controls.run(async () => {
      await api("/v1/publisher/repositories", {
        repository: repository.value.trim(),
        redistribution_consent: consent.checked,
      });
      await controls.refresh();
      controls.notify(
        "Repository connected. You can now choose one of its releases.",
      );
    });
  };
  connect.append(registration);
  root.append(connect);
  if (repos.length) {
    const form = el("form", "", "publish-wizard");
    form.noValidate = true;
    const steps = el("ol", "", "steps");
    const names = [
      "Choose repository",
      "Release and package details",
      "Review and submit",
    ];
    const sections = names.map((name) => {
      const set = el("fieldset");
      set.append(el("legend", name));
      return set;
    });
    let step = 0;
    for (const name of names) steps.append(el("li", name));
    form.append(steps, ...sections);
    const repositorySelect = selectField(sections[0], "Repository");
    repositorySelect.name = "repository_id";
    repositorySelect.required = true;
    repositorySelect.append(
      option("Choose a connected repository", ""),
      ...repos.map((repo: any) => option(repo.full_name, String(repo.id))),
    );
    if (repos.length === 1) repositorySelect.value = String(repos[0].id);
    sections[0].append(
      el(
        "p",
        "Choose the repository that owns this package. If GitHub permissions have changed, register it again above.",
        "hint",
      ),
    );
    const releases = selectField(sections[1], "GitHub release"),
      assets = selectField(sections[1], "Installer ZIP");
    releases.name = "release_id";
    assets.name = "asset_id";
    releases.required = assets.required = true;
    const identity = el("div", "", "form-grid"),
      id = inputField(
        identity,
        "NEMESIS package ID",
        "package_id",
        "text",
        "",
        "Must match id in the installer’s NEMESIS.data manifest.",
      ),
      version = inputField(
        identity,
        "Package version",
        "version",
        "text",
        "",
        "Must match the manifest version. The release tag is only a suggestion.",
      );
    id.required = version.required = true;
    sections[1].append(identity);
    const name = inputField(sections[1], "Package name", "name"),
      description = inputField(
        sections[1],
        "Description",
        "description",
        "textarea",
      );
    name.required = description.required = true;
    const categories = inputField(
      sections[1],
      "Categories",
      "categories",
      "text",
      "",
      "Separate categories with commas, for example Utilities, Media.",
    );
    const requirements = el("details");
    requirements.append(
      el("summary", "Vehicle and firmware requirements (optional)"),
    );
    const vehicles = inputField(
        requirements,
        "Supported vehicles",
        "vehicles",
        "text",
        "",
        "Separate vehicle names with commas.",
      ),
      firmware = inputField(
        requirements,
        "Firmware requirements",
        "firmware",
        "text",
        "",
        "Separate requirements with commas.",
      ),
      nemesis = inputField(
        requirements,
        "NEMESIS requirements",
        "nemesis",
        "text",
        "",
        "Specify the supported NEMESIS version or other requirements.",
      );
    sections[1].append(requirements);
    const notes = inputField(
      sections[1],
      "Release notes",
      "release_notes",
      "textarea",
    );
    notes.required = false;
    const review = el("div");
    sections[2].append(
      review,
      el(
        "p",
        "After submission, the ZIP is validated automatically and a maintainer reviews this version. It stays private until approved.",
        "callout",
      ),
    );
    const buttons = el("div", "", "wizard-actions"),
      back = action("Back", () => show(step - 1), "quiet"),
      next = el("button", "Continue", "primary");
    next.type = "submit";
    buttons.append(back, next);
    form.append(buttons);
    root.append(form);
    let releaseData: any[] = [];
    function show(index: number) {
      step = index;
      sections.forEach((section, i) => (section.hidden = i !== step));
      Array.from(steps.children).forEach((item, i) => {
        if (i === step) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
      back.hidden = step === 0;
      next.textContent = step === 2 ? "Submit for review" : "Continue";
      if (step === 2) renderReview();
      const legend = sections[step].querySelector("legend")!;
      legend.tabIndex = -1;
      legend.focus();
    }
    function list(value: string) {
      return value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    function payload() {
      return {
        repository_id: Number(repositorySelect.value),
        release_id: Number(releases.value),
        asset_id: Number(assets.value),
        package_id: id.value.trim(),
        version: version.value.trim(),
        metadata: {
          name: name.value.trim(),
          description: description.value,
          categories: list(categories.value),
          compatibility: {
            vehicles: list(vehicles.value),
            firmware: list(firmware.value),
            nemesis: nemesis.value,
          },
          release_notes: notes.value,
        },
      };
    }
    function renderReview() {
      const value = payload(),
        release = releaseData.find((x) => x.id === Number(releases.value)),
        asset = release?.assets.find((x: any) => x.id === Number(assets.value));
      review.replaceChildren(
        el("h2", value.metadata.name),
        el("p", value.package_id + " " + value.version, "byline"),
        el("p", value.metadata.description, "notes"),
        el(
          "p",
          "Repository: " +
            repos.find((x: any) => x.id === value.repository_id)?.full_name,
        ),
        el(
          "p",
          "Installer: " + (asset?.name || "") + " · " + size(asset?.size || 0),
        ),
        el("p", compatibility(value.metadata.compatibility)),
        el("h3", "Release notes"),
        el(
          "p",
          value.metadata.release_notes || "No release notes supplied.",
          "notes",
        ),
      );
      if (release?.html_url)
        review.append(
          external("Review original GitHub release", release.html_url),
        );
    }
    releases.onchange = () => {
      const release = releaseData.find((x) => x.id === Number(releases.value));
      assets.replaceChildren(
        option("Choose an installer ZIP", ""),
        ...(release?.assets || [])
          .filter((asset: any) => /\.zip$/i.test(asset.name))
          .map((asset: any) => option(asset.name, String(asset.id))),
      );
      if (assets.options.length === 2) assets.selectedIndex = 1;
      version.value = release?.tag_name.replace(/^[vV](?=\d)/, "") || "";
      notes.value = release?.body || "";
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      void controls.run(async () => {
        const fields = sections[step].querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input,select,textarea");
        for (const field of fields) if (!field.reportValidity()) return;
        if (step === 0) {
          next.disabled = true;
          try {
            releaseData = await api(
              "/v1/publisher/repositories/" +
                repositorySelect.value +
                "/releases",
            );
            if (!controls.active()) return;
            releases.replaceChildren(
              option("Choose a release", ""),
              ...releaseData
                .filter((x) => !x.draft)
                .map((x) => option(x.tag_name, String(x.id))),
            );
            assets.replaceChildren();
            const existing = submissions.filter(
              (x: any) => x.repository_id === Number(repositorySelect.value),
            );
            const ids = [...new Set(existing.map((x: any) => x.package_id))];
            if (ids.length === 1) {
              id.value = String(ids[0]);
              const previous = JSON.parse(existing[0].metadata);
              name.value = previous.name;
              description.value = previous.description;
              categories.value = previous.categories.join(", ");
              vehicles.value = previous.compatibility.vehicles.join(", ");
              firmware.value = previous.compatibility.firmware.join(", ");
              nemesis.value = previous.compatibility.nemesis;
            }
            show(1);
          } finally {
            next.disabled = false;
          }
        } else if (step === 1) show(2);
        else {
          next.disabled = true;
          try {
            await api("/v1/publisher/submissions", payload());
            await controls.refresh();
            controls.notify(
              "Submitted. You can follow validation and review in My submissions.",
            );
          } finally {
            next.disabled = false;
          }
        }
      });
    };
    show(0);
  }
  for (const event of events)
    if (event.status === "selection_required")
      root.append(el("p", event.full_name + ": " + event.message, "callout"));
  const dashboard = el("section", "", "submissions");
  dashboard.append(
    el("h2", "My submissions"),
    action("Refresh status", () => controls.run(controls.refresh), "quiet"),
  );
  const rows = el("div");
  dashboard.append(rows);
  root.append(dashboard);
  function renderStatus(values: any[]) {
    rows.replaceChildren();
    if (!values.length)
      rows.append(el("p", "Your submitted versions will appear here."));
    for (const submission of values) {
      const row = el("article", "", "submission-row");
      row.append(
        el("h3", submission.package_id + " " + submission.version),
        el(
          "span",
          statusLabels[submission.status] || submission.status,
          "status-badge",
        ),
        el(
          "p",
          submission.report ||
            "The registry will update this status as checks finish.",
        ),
      );
      if (submission.status === "approved")
        row.append(
          link(
            "View package",
            "#packages/" + encodeURIComponent(submission.package_id),
          ),
        );
      rows.append(row);
    }
  }
  renderStatus(submissions);
  async function poll() {
    if (!controls.active()) return;
    try {
      const values = await api("/v1/publisher/submissions");
      if (!controls.active()) return;
      renderStatus(values);
      if (
        values.some((s: any) =>
          ["queued", "validating", "review"].includes(s.status),
        )
      )
        setTimeout(poll, 10000);
    } catch {
      /* Manual refresh remains available after a failed status poll. */
    }
  }
  if (
    submissions.some((s: any) =>
      ["queued", "validating", "review"].includes(s.status),
    )
  )
    setTimeout(poll, 10000);
}
