import { api } from "./client";
import { el, action, link } from "./ui";

type Controls = {
  run: (task: () => Promise<unknown>) => Promise<unknown>;
  refresh: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
};

export function renderPublisherPackages(
  root: HTMLElement,
  packages: any[],
  controls: Controls,
) {
  const section = el("section", "", "submissions");
  section.append(
    el("h2", "My published packages"),
    el(
      "p",
      "Unpublish only packages you have published. This withdraws all registry versions and stops pending publication; GitHub releases and existing offline copies stay unchanged.",
      "hint",
    ),
  );
  if (!packages.length)
    section.append(el("p", "You have no published packages to remove."));
  for (const pkg of packages) {
    const card = el("article", "", "submission-row");
    const metadata = JSON.parse(pkg.metadata);
    card.append(
      el("h3", metadata.name || pkg.id),
      el("p", pkg.id + " · " + pkg.repository),
      el(
        "p",
        pkg.published_versions +
          " published version" +
          (pkg.published_versions === 1 ? "" : "s"),
      ),
      link("View package", "#packages/" + encodeURIComponent(pkg.id)),
    );
    const remove = action(
      "Unpublish package",
      () =>
        controls.run(async () => {
          if (
            !confirm(
              "Unpublish all versions of " +
                pkg.id +
                " and stop its pending publications? Registry downloads will stop. GitHub releases and existing offline copies will remain.",
            )
          )
            return;
          const reason = prompt("Reason for unpublishing " + pkg.id);
          if (reason === null) return;
          if (!reason.trim())
            throw new Error("Enter a reason for unpublishing this package.");
          remove.disabled = true;
          try {
            await api(
              "/v1/publisher/packages/" +
                encodeURIComponent(pkg.id) +
                "/remove",
              { reason: reason.trim() },
            );
            await controls.refresh();
            controls.notify(
              pkg.id +
                " was unpublished. Existing offline copies cannot be recalled.",
            );
          } finally {
            remove.disabled = false;
          }
        }),
      "quiet",
    );
    card.append(remove);
    section.append(card);
  }
  root.append(section);
}
