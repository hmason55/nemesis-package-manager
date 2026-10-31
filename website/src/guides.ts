import { el, link, heading } from "./ui";

type Guide = {
  id: string;
  title: string;
  audience: string;
  intro: string;
  figure: string;
  alt: string;
  sections: { title: string; steps: string[]; note?: string }[];
};
export const guides: Guide[] = [
  {
    id: "start",
    title: "Start here",
    audience: "Everyone",
    intro:
      "Choose how packages reach your parked vehicle. NEMESIS must already be installed on a compatible head unit; Package Manager delegates installation to NEMESIS.",
    figure: "workflow.svg",
    alt: "Two paths: registry directly to the vehicle, or manual/registry packages through Companion and USB to the vehicle.",
    sections: [
      {
        title: "Choose your path",
        steps: [
          "Have a working vehicle internet connection? Use Cloud Registry in the vehicle to browse and download approved packages.",
          "Prefer USB or need offline access? Run USB Companion on your computer, select your drive, and prepare installers manually or from the registry.",
          "Downloading or copying an installer does not install it. Read its requirements and confirm installation in the parked vehicle.",
        ],
        note: "Trusted validation and a matching SHA-256 identify the published bytes. They do not guarantee that a community package is safe or compatible with your vehicle.",
      },
      {
        title: "Install Package Manager itself",
        steps: [
          "Download a tested Package Manager release from the repository’s Releases page. Choose the USB-ready bundle for initial drive setup, not the source-code archive.",
          "Open Companion → Drive setup, select the existing USB drive and the manager release bundle, then choose Set up drive. Preserve any other drive files you need.",
          "Follow the dedicated NEMESIS Manager installation/update instructions supplied with that release. Copying a newer manager onto USB does not replace an already-installed manager.",
        ],
        note: "Package Manager self-update stays separate from ordinary community package updates. Follow the release’s signing and firmware instructions; never bypass certificate verification.",
      },
    ],
  },
  {
    id: "vehicle",
    title: "Use Package Manager in the vehicle",
    audience: "Vehicle users",
    intro:
      "Manage installed packages and choose Cloud Registry or USB Storage as your source for new installers.",
    figure: "vehicle-settings.svg",
    alt: "Illustrative Settings controls for source selection, registry address, device profile and startup prompting.",
    sections: [
      {
        title: "Choose a source",
        steps: [
          "On startup, choose Cloud Registry or USB Storage and press Continue. Use Don't show again on startup only if you want the saved source to open automatically.",
          "Open Settings near Help/Refresh to change your source, registry address, startup preference, or known vehicle/firmware/NEMESIS information.",
          "For USB Storage, connect the prepared drive and press Refresh. Cloud searches must not filter your USB installers or scripts.",
        ],
        note: "Cloud is optional. Keep a prepared USB drive for offline use. Installed packages remain manageable independently of the selected discovery source.",
      },
      {
        title: "Browse, download, and install",
        steps: [
          "Choose Available for new packages or Updates for confirmed newer versions. Select a package and read Details, supported versions, and release notes.",
          "In cloud mode choose the required version and download it. Wait for integrity/archive checks. A cancelled or failed download must not start installation.",
          "Review the final installation confirmation, including compatibility warnings. Confirm only after checking the publisher’s instructions; wait for the NEMESIS result and refresh installed state.",
        ],
        note: "A mismatch is advisory and does not remove your ability to confirm. Unknown compatibility is not a statement of support. An incomparable version is a manual selection, not a confirmed upgrade.",
      },
      {
        title: "Installed packages and scripts",
        steps: [
          "Use Installed to inspect, launch, or uninstall eligible packages. Locked packages and Package Manager itself retain their protections.",
          "Check the confirmation before uninstalling. Removing a package in the vehicle is different from removing its installer from USB.",
          "Scripts are a USB workflow. In cloud mode follow the switch-to-USB action in Scripts, and read the script’s instructions before running it.",
          "If installed-state lookup fails, use Refresh and inspect Details rather than treating the list as successfully empty.",
        ],
      },
    ],
  },
  {
    id: "companion-manual",
    title: "Prepare USB packages manually",
    audience: "Computer users",
    intro:
      "Use ZIPs you already downloaded. Manual import and drive preparation work without a configured registry or internet connection.",
    figure: "companion-packages.svg",
    alt: "Illustrative Companion package list showing USB versions and per-package actions.",
    sections: [
      {
        title: "Select and prepare a drive",
        steps: [
          "Launch the standalone Companion or run python -m tools.usb_companion from the repository. Keep its local server window open.",
          "Choose your USB drive. Use Drive not listed? to select its existing mount path, then confirm the displayed drive and free space.",
          "For first-time Package Manager setup, open Drive setup and choose the manager USB-ready release bundle. For community installers, use Packages → Add package.",
        ],
        note: "Companion prepares USB files on your computer. It does not install packages on the vehicle, and it never formats a drive as part of ordinary package import.",
      },
      {
        title: "Add or update an installer",
        steps: [
          "Choose a trusted release ZIP, not GitHub’s generated source archive. Existing local workflows also support their documented wrapper bundles and scripts.",
          "For a new package, review the suggested destination folder. To update, choose the matching existing package and confirm its destination.",
          "Wait for copying to finish. The importer keeps existing data/ directories when replacing an installer. If import fails, inspect the error and retain any reported recovery files.",
          "Safely eject the drive. In the vehicle choose USB Storage → Refresh, select the package, and confirm Install or Update.",
        ],
        note: "The internal package ID is the identity; a folder name is only a location. If multiple folders contain the same ID, explicitly choose the destination. Loose installer ZIPs are inspection-only replacement targets.",
      },
    ],
  },
  {
    id: "companion-registry",
    title: "Prepare USB packages from the registry",
    audience: "Computer users",
    intro:
      "Browse approved packages inside Companion and copy verified installers to USB without a separate browser download/import step.",
    figure: "companion-registry.svg",
    alt: "Illustrative Companion registry connection, search, version selection, preparation, and results.",
    sections: [
      {
        title: "Connect and choose packages",
        steps: [
          "Open Companion → Cloud registry. The built-in staging registry address is ready to use; no setup is needed for the default connection. To use another registry, open Settings in the top bar, enter Registry HTTPS address and choose Save registry. Clear the address and save to disconnect. Operators can also override the default with --registry-url or NEMESIS_REGISTRY_URL; an explicit empty value disables it. Startup does not contact the registry. Manual imports remain available offline.",
          "In Settings, optionally fill Vehicle, Firmware and NEMESIS version and choose Apply profile and refresh results. This profile is saved only in this browser. Select a USB drive. Search the registry, open package information, and review supported vehicles, firmware, NEMESIS versions, and release notes. Public browsing and downloads need no GitHub account.",
          "Choose exact versions and select the packages to prepare. Use Check USB updates to compare the installers currently on that drive; this is not a query of versions installed in the vehicle.",
          "Choose a destination if several managed folders match an ID, then confirm Prepare selected versions.",
        ],
        note: "An arbitrary version string that cannot be ordered is not advertised as a definite upgrade. Select that version manually after reading its release instructions.",
      },
      {
        title: "Follow progress and recover safely",
        steps: [
          "Watch download/verification progress and each package’s result. Companion checks byte size, SHA-256, archive safety, and exact internal ID/version before the importer writes to USB.",
          "Cancel downloads if needed. A directory replacement already in progress finishes safely; cancellation is not a command to kill a filesystem swap.",
          "Keep the same drive connected until preparation finishes. A removed or changed drive invalidates the job’s destination; refresh and select the drive again before retrying.",
          "Read each batch result. Successful packages may be ready even if another failed. Existing data and installers for failed packages are retained; retry only after resolving the reported problem.",
          "Safely eject and use USB Storage in the vehicle. Vehicle installation remains a separate confirmation.",
        ],
      },
    ],
  },
  {
    id: "registry",
    title: "Browse packages and choose versions",
    audience: "Everyone",
    intro:
      "The registry lists validated releases from authorized GitHub publishers. Browsing and downloading are public; sign-in is needed to publish or manage the registry.",
    figure: "workflow.svg",
    alt: "A publisher release passes trusted validation and publishes automatically after authorization and ownership checks.",
    sections: [
      {
        title: "Find the right release",
        steps: [
          "Start typing in Packages search to see results update automatically. Filter by category, publisher, or maximum download size; sort by name, recently published, or smallest download. Recently published does not necessarily mean a newer version.",
          "Open a package, check publisher and repository links, then select an exact approved version. Read Overview, Compatibility, Release notes, and Versions. To compare support declarations with your device, optionally save a device profile in Settings; mismatches remain advisory.",
          "Download the installer ZIP for manual Companion import, browse the same release inside Companion, or use Cloud Registry in the vehicle.",
          "Check integrity information when sharing a package link. A withdrawn release stops new registry downloads and must not silently redirect you to another version.",
        ],
        note: "Keep the package release version separate from supported firmware/NEMESIS versions. A hash proves a byte match, not firmware support. Previously downloaded/offline files cannot be recalled by a withdrawal.",
      },
    ],
  },
  {
    id: "publish",
    title: "Publish a package with GitHub",
    audience: "Package publishers",
    intro:
      "Publishers own their GitHub Releases; the registry validates the selected ZIP and serves validated copies from Cloudflare. Authorized publishers publish automatically after trusted validation, without a maintainer approval step.",
    figure: "publishing.svg",
    alt: "Publisher selects a GitHub release ZIP; trusted validation checks it, ownership and authorization are verified, and validated bytes publish automatically.",
    sections: [
      {
        title: "Connect your GitHub repository",
        steps: [
          "Choose Publish → Sign in with GitHub. Authorize the registry App for your GitHub identity. Reloading the site may require signing in again because the registry token stays in memory.",
          "Use Connect repository on GitHub in the publisher screen. Select the account and only the public repositories you want to publish. The App requires read-only Contents and Metadata access.",
          "Return to Publish and register the public owner/repository name. Your signed-in user must have write, maintain, or administrator permission on it.",
          "If the repository was transferred, App access removed, or permissions changed, restore the intended App installation/access and re-register to reauthorize publishing.",
        ],
        note: "Never put GitHub credentials, private keys, or registry tokens into a package ZIP, repository source, or the public website. End users do not need the publisher App to download packages.",
      },
      {
        title: "Build a directly installable ZIP",
        steps: [
          "Place the package’s NEMESIS.data manifest at the ZIP root, or inside one enclosing directory, with the exact internal package id and version. Keep that ID stable across versions. The reserved usb.package.manager ID uses the separate Package Manager self-update workflow and cannot be published here.",
          "Include the files required by the package’s actual NEMESIS installation format. Do not submit a USB wrapper bundle, source folder, source-code ZIP, or standalone script as a cloud installer.",
          "Keep compressed size within 512 MiB and respect archive entry/expansion limits. Unsafe paths, links, duplicate/case-aliased members, corruption, or identity mismatches fail validation.",
          "Create a GitHub Release and upload the finished ZIP as a release asset. Publish the release; drafts are not accepted. A tag can suggest a version, but the manifest is authoritative.",
        ],
        note: "Minimal identity example only, not a complete vehicle application: [nemesis] with id=example.app, name=Example, and version=1.0. Include the installation metadata and payload required by your package type.",
      },
      {
        title: "Confirm your submission and follow validation",
        steps: [
          "In Publish, choose the registered repository, release, and exact installer asset. When several ZIPs exist, explicitly select the right one.",
          "Enter the exact internal ID/version and a useful name/description. Expand More package details for optional categories, release notes, and compatibility declarations. A square icon.png at the repository root supplies a custom package icon; otherwise the GitHub publisher avatar is used. Review the ZIP filename and destination release identity.",
          "Acknowledge that you have permission to redistribute the ZIP through the registry, then submit at the final confirmation step.",
          "Follow status: Queued → Validating → Finishing publication → Published. Trusted validation downloads the exact asset, checks all archive bytes/identity, and never runs package scripts or repository code. Successful validation publishes automatically; no administrator approval is required.",
          "If validation fails, read the report and fix the artifact. Administrators can retry failed jobs. A rejected or corrected artifact may require a new release asset and version. A repository or publisher may have up to 20 active queued/validating/finishing jobs; if the queue is full, wait for jobs to finish before submitting more.",
          "Successful publication reserves ownership of the global package ID for the repository. Later versions and listing metadata changes use the same authorization, trusted validation, and automatic publication path.",
        ],
        note: "Approved version bytes are immutable. Use a new version when bytes change. Withdrawal stops new registry discovery/downloads; it does not uninstall packages or erase existing offline copies.",
      },
      {
        title: "Synchronize and declare support",
        steps: [
          "New release webhooks can create submissions for registered packages. The scheduled synchronization is not instant; use the publisher’s manual synchronization/asset selection when appropriate.",
          "If several packages or suitable ZIPs exist, select the package and asset manually. Resolve permission failures by reauthorizing, rather than repeatedly uploading the same bytes.",
          "Supported vehicles and firmware are optional lists; NEMESIS support is a separate optional field. Exact case-insensitive identifiers and * have defined matching behavior. Prose or version ranges remain informational unless a matcher explicitly understands them.",
          "Do not advertise missing or unknown declarations as verified support. Explicit mismatches produce advisory warnings and do not become installation or publication gates.",
        ],
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting and compatibility",
    audience: "Everyone",
    intro:
      "Keep failures visible and recoverable. A failed lookup, unknown compatibility, or cancelled transfer is different from a successful empty result.",
    figure: "manager-result.svg",
    alt: "Illustrative readable vehicle operation result with a summary and access to diagnostic details.",
    sections: [
      {
        title: "Choose a safe next action",
        steps: [
          "Registry unavailable: retain installed-package access, switch to USB when needed, and retry the cloud operation after connectivity returns. Do not disable HTTPS certificate or hostname checks.",
          "Hash, size, manifest, or unsafe archive error: do not import or install those bytes. Obtain the approved release again or ask the publisher to submit a corrected new version.",
          "USB removed, changed, or wrong destination: reconnect and explicitly select the drive again. Keep recovery files mentioned by an importer error and inspect per-package results before retrying.",
          "Installation failed: read Details and the NEMESIS result. Do not treat a failed installed-state query as evidence that a package was uninstalled.",
          "Publisher cannot see a repository/release: check public visibility, signed-in repository permissions, selected App installation, release publication, and the chosen ZIP asset.",
        ],
      },
      {
        title: "Understand compatibility warnings",
        steps: [
          "Match: the known profile matches declared exact values; this is still publisher information, not a hardware certification.",
          "Mismatch: at least one known profile value differs from an understood declaration. Read the conflicting field and decide whether to continue through the ordinary confirmation.",
          "Unknown: profile information is missing, a declaration is absent, or range/prose syntax is not understood. Check the publisher’s documentation and your device information.",
          "Optional information must never block publication, downloads, USB preparation, or installation. Ordinary integrity, authorization, locked-package, and installation protections still apply.",
        ],
      },
    ],
  },
];

const asset = (name: string) => import.meta.env.BASE_URL + "guides/" + name;
export function renderGuides(root: HTMLElement, id = "") {
  const chosen = guides.find((g) => g.id === id);
  if (!chosen) {
    heading(
      root,
      id ? "Guide not found" : "Guides",
      "Clear paths for vehicle users, USB users, and package publishers.",
    );
    if (id) root.append(el("p", "Choose one of the guides below."));
    const cards = el("div", "", "guide-cards");
    for (const guide of guides) {
      const card = el("article", "", "guide-card");
      const title = el("h2");
      title.append(link(guide.title, "#guides/" + guide.id));
      card.append(
        el("p", guide.audience, "eyebrow"),
        title,
        el("p", guide.intro),
      );
      cards.append(card);
    }
    root.append(cards);
    const library = el("details", "", "guide-library");
    library.append(
      el("summary", "Illustration library — example screens"),
      el(
        "p",
        "These labeled illustrations explain tasks; package names, versions, and screenshots are examples, not evidence of vehicle compatibility.",
        "hint",
      ),
    );
    const illustrations = [
      "companion-packages",
      "companion-remove",
      "companion-setup",
      "manager-available",
      "manager-confirmation",
      "manager-details",
      "manager-help",
      "manager-installed",
      "manager-progress",
      "manager-result",
      "manager-scripts",
      "manager-updates",
    ];
    const gallery = el("div", "", "guide-cards");
    for (const name of illustrations) {
      const label = name
        .split("-")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");
      const figure = el("figure");
      const image = el("img");
      image.src = asset(name + ".svg");
      image.alt = "Illustrative " + label + " screen";
      image.loading = "lazy";
      const full = link(
        "Open " + label + " illustration",
        asset(name + ".svg"),
      );
      figure.append(image, el("figcaption", label + " — example screen"), full);
      gallery.append(figure);
    }
    library.append(gallery);
    root.append(library);
    return;
  }
  root.append(link("← All guides", "#guides", "text-link"));
  heading(root, chosen.title, chosen.intro);
  const layout = el("div", "", "guide-layout"),
    nav = el("nav", "", "guide-toc"),
    article = el("article", "", "guide-article");
  nav.setAttribute("aria-label", "Guide sections");
  nav.append(el("h2", "In this guide"));
  chosen.sections.forEach((section, index) => {
    const a = link(
      section.title,
      "#guides/" + chosen.id + "?section=" + (index + 1),
    );
    nav.append(a);
  });
  const figure = el("figure");
  const image = el("img");
  image.src = asset(chosen.figure);
  image.alt = chosen.alt;
  image.loading = "lazy";
  figure.append(
    image,
    el(
      "figcaption",
      "Illustrative workflow or example screen. Package names and versions shown are examples; follow your actual release’s instructions.",
    ),
  );
  article.append(figure);
  chosen.sections.forEach((section, index) => {
    const node = el("section", "", "guide-section");
    node.id = "guide-section-" + (index + 1);
    node.append(el("h2", section.title));
    const steps = el("ol");
    section.steps.forEach((text) => steps.append(el("li", text)));
    node.append(steps);
    if (section.note) node.append(el("aside", section.note, "callout"));
    article.append(node);
  });
  const related = el("nav", "", "guide-related");
  related.setAttribute("aria-label", "Related guides");
  related.append(el("h2", "Next steps"));
  for (const guide of guides)
    if (guide.id !== chosen.id)
      related.append(link(guide.title, "#guides/" + guide.id));
  article.append(related);
  layout.append(nav, article);
  root.append(layout);
}
