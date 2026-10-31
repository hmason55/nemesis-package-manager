import { el, link, external, heading } from "./ui";
import { icon, type IconName } from "./icons";

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
      "New to NEMESIS packages? Set up Package Manager first, then choose USB or an internet download.",
    figure: "workflow.svg",
    alt: "Two paths: registry directly to the vehicle, or manual/registry packages through Companion and USB to the vehicle.",
    sections: [
      {
        title: "Before you start",
        steps: [
          "NEMESIS must already be installed and working on your vehicle’s screen (the head unit). Check your vehicle and firmware against the [user guide](https://github.com/hmason55/nemesis-package-manager/blob/main/docs/USER-GUIDE.md).",
          "Use a computer and a USB drive for first-time setup. Park the vehicle before installing packages.",
        ],
        note: "Package Manager helps you install and manage community apps. Each app has its own vehicle and firmware requirements.",
      },
      {
        title: "Set up Package Manager",
        steps: [
          "Download USB Companion for [Windows](https://github.com/hmason55/nemesis-package-manager/releases/latest/download/nemesis-usb-companion-windows-x86_64.zip) or [Linux x86-64](https://github.com/hmason55/nemesis-package-manager/releases/latest/download/nemesis-usb-companion-linux-x86_64.tar.gz). Extract the download and open Companion.",
          "Download [usb-package-manager-ready.zip](https://github.com/hmason55/nemesis-package-manager/releases/latest/download/usb-package-manager-ready.zip) from the [repository’s Releases page](https://github.com/hmason55/nemesis-package-manager/releases).",
          "In Companion, select your USB drive and open Drive setup. Choose usb-package-manager-ready.zip, then select Set up drive.",
          "Wait for setup to finish, then safely eject the drive.",
          "In the parked vehicle, wait for the screen to finish starting. Insert the drive and approve the NEMESIS execution prompt. Package Manager installs if needed and opens.",
        ],
        note: "Already have Package Manager? Follow the [update instructions](https://github.com/hmason55/nemesis-package-manager/blob/main/docs/UPDATING.md#update-package-manager). Copying a newer ZIP to USB does not update the installed app.",
      },
      {
        title: "Add your first package",
        steps: [
          "Have internet in the vehicle? Follow [Install packages in your vehicle](#guides/vehicle) and choose Cloud Registry.",
          "Prefer USB? Follow [Copy downloaded packages to USB](#guides/companion-manual). You can also [choose packages inside Companion](#guides/companion-registry).",
          "Read the package’s requirements before you install. Downloading or copying a ZIP only prepares it; confirm Install in the vehicle to finish.",
        ],
        note: "If a package’s requirements are unclear, check with its publisher before installing.",
      },
    ],
  },
  {
    id: "vehicle",
    title: "Install packages in your vehicle",
    audience: "Vehicle users",
    intro:
      "Use Package Manager on your vehicle’s screen. NEMESIS and Package Manager must already be installed.",
    figure: "vehicle-settings.svg",
    alt: "Illustrative Settings controls for source selection, registry address, device profile and startup prompting.",
    sections: [
      {
        title: "Choose where to get packages",
        steps: [
          "Open Package Manager. Choose Cloud Registry for internet downloads or USB Storage for a prepared USB drive.",
          "Press Continue. The scan starts after the prompt closes.",
          "For USB Storage, keep your prepared drive connected and press Refresh.",
        ],
        note: "To change the source later, open Settings. Cloud downloads need internet; prepared USB packages work offline.",
      },
      {
        title: "Install or update a package",
        steps: [
          "Open Available to find new packages, or Updates to find newer versions.",
          "Select a package and open Details. Read its vehicle requirements and release notes.",
          "Press Install or Update. If a version list appears, choose the version you want.",
          "For Cloud Registry, wait for the download and checks to finish.",
          "Read the confirmation and any compatibility warnings. Confirm installation when you are ready.",
          "Keep USB connected until the result appears. Press Refresh to update the lists.",
        ],
        note: "A compatibility warning does not prove a package will work. Ask the publisher if you are unsure. A failed or cancelled download does not start installation.",
      },
      {
        title: "Open or remove an installed package",
        steps: [
          "Open Installed and select a package.",
          "Choose Launch to open it, Details to read more, or Uninstall to remove it.",
          "Read and confirm any removal prompt. Uninstalling from the vehicle does not remove the installer from USB.",
          "To run a script, switch to USB Storage and open Scripts. Read the script’s instructions first.",
        ],
        note: "Package Manager itself and locked packages cannot be removed here. Follow their own removal instructions.",
      },
      {
        title: "Search and change settings",
        steps: [
          "Use Search packages to filter the current tab. Clear removes the search.",
          "Press Back or Done/OK to hide the keyboard without clearing your text.",
          "Open Settings to change the source, registry address, or vehicle information. Save applies settings.",
        ],
        note: "If a list fails to load, press Refresh and read the error in Details. A failed scan does not mean your installed packages are gone.",
      },
    ],
  },
  {
    id: "companion-manual",
    title: "Copy downloaded packages to USB",
    audience: "Computer users",
    intro:
      "Use USB Companion on your computer to copy package ZIPs to your drive. Install them later in the vehicle.",
    figure: "companion-packages.svg",
    alt: "Illustrative Companion package list showing USB versions and per-package actions.",
    sections: [
      {
        title: "Open Companion and select your drive",
        steps: [
          "Download Companion for [Windows](https://github.com/hmason55/nemesis-package-manager/releases/latest/download/nemesis-usb-companion-windows-x86_64.zip) or [Linux x86-64](https://github.com/hmason55/nemesis-package-manager/releases/latest/download/nemesis-usb-companion-linux-x86_64.tar.gz). Extract it and open the app.",
          "Keep Companion’s server window open while you use its browser page.",
          "Connect your USB drive and select it in Companion. Check that the displayed drive and free space are correct.",
          "If the drive is missing, open Settings → Drive not listed? and select its location.",
        ],
        note: "First time setting up Package Manager? Follow [Start here](#guides/start) before adding community packages. Companion does not format the drive.",
      },
      {
        title: "Copy a package",
        steps: [
          "Download the package’s installer ZIP from its release page. Choose the installer, not GitHub’s source-code download.",
          "In Companion, open Packages → Add package and choose the ZIP.",
          "Check the suggested folder. For an update, choose the existing folder for that package.",
          "Confirm and wait for copying to finish. Existing data/ folders are kept when an installer is replaced.",
          "Safely eject the drive.",
        ],
        note: "If copying fails, read the error and keep any recovery files it mentions. You can import downloaded ZIPs without internet.",
      },
      {
        title: "Install in the vehicle",
        steps: [
          "In the parked vehicle, connect the prepared USB drive and open Package Manager.",
          "Choose USB Storage, press Continue, then Refresh.",
          "Open Available for a new package or Updates for an update. Select the package.",
          "Read Details, choose Install or Update, and confirm.",
          "Keep USB connected until the result appears.",
        ],
        note: "Companion shows versions on USB. Package Manager also checks what is installed in the vehicle.",
      },
    ],
  },
  {
    id: "companion-registry",
    title: "Choose packages in USB Companion",
    audience: "Computer users",
    intro:
      "Find packages inside Companion and copy them straight to USB. This needs internet on your computer.",
    figure: "companion-registry.svg",
    alt: "Illustrative Companion registry connection, search, version selection, preparation, and results.",
    sections: [
      {
        title: "Find and copy packages",
        steps: [
          "Open Companion and select your USB drive.",
          "Scroll to Cloud registry below the USB tabs. The built-in staging registry address is ready to use. No GitHub sign-in is needed.",
          "Type a package name in Search registry packages. Use Filter results if you need to narrow the list.",
          "Select a package and choose a version. Read its release notes and expand Version details for requirements.",
          "Check the destination folder. If more than one folder matches, choose the one you want to update.",
          "Select Prepare selected versions and wait for each package’s result.",
        ],
        note: "Check USB updates compares versions on the drive, not versions installed in the vehicle. Manual imports remain available offline.",
      },
      {
        title: "Change optional settings",
        steps: [
          "To use a different registry, open Settings, enter its Registry HTTPS address, and choose Save registry. This change lasts for the current Companion session.",
          "To check package requirements against your vehicle, enter Vehicle, Firmware and NEMESIS version. Choose Apply profile and refresh results.",
          "To disconnect the registry, clear its address and save. Downloaded ZIPs can still be added manually.",
        ],
        note: "Vehicle details are optional. A match compares the publisher’s requirements with your saved details; it does not guarantee compatibility.",
      },
      {
        title: "Finish and install",
        steps: [
          "Keep the same USB drive connected until preparation finishes. Companion checks downloads before copying them.",
          "Read each result. If one package fails, others may have copied successfully. Fix the reported problem before retrying.",
          "If you cancel, wait for Companion to finish any copy already in progress before removing USB.",
          "Safely eject the drive and follow [Install packages in your vehicle](#guides/vehicle), choosing USB Storage.",
        ],
        note: "Copying to USB does not install anything in the vehicle. Installation needs a separate confirmation there.",
      },
    ],
  },
  {
    id: "registry",
    title: "Find and download a package",
    audience: "Everyone",
    intro:
      "Search this website for community packages. You can browse and download without signing in.",
    figure: "registry-package.svg",
    alt: "Example registry package page with exact version selection, download, metadata tabs and integrity information.",
    sections: [
      {
        title: "Choose a package",
        steps: [
          "Open [Packages](#packages) and type a name in the search box.",
          "Use Filter packages to narrow the results if needed. Recently published means recently added to the registry, not necessarily a newer package version.",
          "Open a package and choose the version you want.",
          "Read Overview, Compatibility and Release notes. Check that the publisher supports your vehicle and firmware.",
        ],
        note: "You can save your vehicle information in [Settings](#settings) to compare requirements. Missing information or a matching firmware number does not prove support.",
      },
      {
        title: "Download and install",
        steps: [
          "Select Download installer ZIP.",
          "Follow [Copy downloaded packages to USB](#guides/companion-manual) to prepare the ZIP with Companion.",
          "In the parked vehicle, use Package Manager to install it from USB Storage.",
          "Prefer an internet download in the vehicle? Follow [Install packages in your vehicle](#guides/vehicle) and choose Cloud Registry instead.",
        ],
        note: "A withdrawn version is no longer available for new downloads. Files you already downloaded remain on your computer or USB drive.",
      },
    ],
  },
  {
    id: "publish",
    title: "Publish a package with GitHub",
    audience: "Package publishers",
    intro:
      "Share a package from a public GitHub repository you can manage. Connect the repository, choose an installer ZIP, and submit it. Successful checks publish it automatically.",
    figure: "publishing.svg",
    alt: "Publisher selects a GitHub release ZIP; trusted validation checks it, ownership and authorization are verified, and validated bytes publish automatically.",
    sections: [
      {
        title: "Connect your GitHub repository",
        steps: [
          "Open [Publish](#publish) and choose Sign in with GitHub.",
          "Select Connect repository on GitHub. Give the NEMESIS GitHub App access to the public repository you want to publish.",
          "Return to [Publish](#publish). Enter the repository as owner/repository, confirm your permission to share its releases, and choose Register repository.",
          "If the repository is missing, check that it is public and that your GitHub account has write, maintain, or administrator access.",
        ],
        note: "Your session lasts one hour. If repository ownership or App access changes, restore access and register the repository again.",
      },
      {
        title: "Build a directly installable ZIP",
        steps: [
          "Place the package’s NEMESIS.data manifest at the ZIP root, or inside one enclosing directory, with the exact internal package id and version. Keep that ID stable across versions. The reserved usb.package.manager ID uses the separate Package Manager self-update workflow and cannot be published here.",
          "Include the files required by the package’s [actual NEMESIS installation format](https://github.com/hmason55/nemesis-package-manager/blob/main/docs/RELEASE-LAYOUTS.md). Do not submit a USB wrapper bundle, source folder, source-code ZIP, or standalone script as a cloud installer.",
          "Keep compressed size within 512 MiB and respect archive entry/expansion limits. Unsafe paths, links, duplicate/case-aliased members, corruption, or identity mismatches fail validation.",
          "Create a GitHub Release and upload the finished ZIP as a release asset. Publish the release; drafts are not accepted. A tag can suggest a version, but the manifest is authoritative.",
        ],
        note: "Minimal identity example only, not a complete vehicle application: [nemesis] with id=example.app, name=Example, and version=1.0. Include the installation metadata and payload required by your package type.",
      },
      {
        title: "Confirm your submission and follow validation",
        steps: [
          "In [Publish](#publish), choose your repository and press Continue.",
          "Choose a GitHub release and its installer ZIP. If there are several ZIPs, check the filename carefully.",
          "Enter the package ID and version from NEMESIS.data inside the ZIP. Add a clear package name and description.",
          "Open More package details if you want to add categories, release notes, or vehicle requirements.",
          "Press Continue. Check the package details and confirm your permission to share the ZIP, then submit.",
          "Watch My submissions for the result. The registry checks the ZIP and publishes automatically; no administrator approval is required.",
          "If validation fails, read the report. Correct the ZIP and use a new version when its contents change.",
        ],
        note: "Keep the package ID the same for updates. Published files cannot be replaced with different contents under the same version. An optional icon.png beside NEMESIS.data supplies the package image; use a non-interlaced PNG up to 512 × 512 pixels and 256 KiB.",
      },
      {
        title: "Unpublish your packages",
        steps: [
          "Sign in with the GitHub account that successfully published the package. Open [Publish → My published packages](#publish) and choose Unpublish package.",
          "Confirm that all published versions will be withdrawn and pending publication stopped, then enter a reason. Only personally published packages are eligible; repository registration or collaboration alone is insufficient. Current GitHub repository permission and authorization are checked again.",
          "Registry downloads stop, but GitHub releases, stored artifacts, audit history, package ID ownership, and existing offline copies remain. Published version bytes cannot be replaced.",
        ],
        note: "Maintainers can use [Manage registry](#moderate) → Remove package for any package. Unpublishing does not uninstall packages from vehicles.",
      },
      {
        title: "Republish a withdrawn version",
        steps: [
          "To restore a version you unpublished, open [Publish → My submissions](#publish), find its Withdrawn row, and choose Republish version.",
          "Confirm the original package ID/version and ZIP/hash, then enter a reason. Current repository authorization, publishing blocks, ownership, and artifact availability are checked again.",
          "The original URL and SHA-256 are restored; changed bytes require a new version. Each version is restored separately, including its retained icon. Stopped pending submissions do not restart.",
          "Administrator and older withdrawals require administrator recovery; contact a registry administrator when My submissions shows that instruction. Maintainers use [Manage registry](#moderate) → Republish version on a Withdrawn row and confirm the same identity and reason.",
        ],
        note: "If restoration fails, resolve the displayed authorization, block, or missing-artifact error before retrying. Republishing does not reinstall packages on vehicles or replace existing offline copies.",
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
    intro: "Find the problem below and follow the suggested next step.",
    figure: "manager-result.svg",
    alt: "Illustrative readable vehicle operation result with a summary and access to diagnostic details.",
    sections: [
      {
        title: "Choose a safe next action",
        steps: [
          "Registry unavailable: retain installed-package access, switch to USB when needed, and retry the cloud operation after connectivity returns. Do not disable HTTPS certificate or hostname checks.",
          "Hash, size, manifest, or unsafe archive error: do not import or install those bytes. Obtain the published release again or ask the publisher to submit a corrected new version.",
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
const guideIcons: Record<string, IconName> = {
  start: "arrow",
  vehicle: "car",
  "companion-manual": "usb",
  "companion-registry": "cloud",
  registry: "package",
  publish: "upload",
  troubleshooting: "guide",
};
// Guide copy supports authored inline links, without interpreting HTML.
function guideText(tag: "li" | "aside", text: string, className = "") {
  const node = el(tag, "", className);
  const links = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+|#[^\s)]+)\)/g;
  let end = 0;
  for (const match of text.matchAll(links)) {
    node.append(text.slice(end, match.index));
    node.append(
      match[2].startsWith("https://")
        ? external(match[1], match[2])
        : link(match[1], match[2]),
    );
    end = match.index! + match[0].length;
  }
  node.append(text.slice(end));
  return node;
}
export function renderGuides(root: HTMLElement, id = "") {
  const chosen = guides.find((g) => g.id === id);
  if (!chosen) {
    heading(
      root,
      id ? "Guide not found" : "Guides",
      "New here? Start with Start here. Then choose the task you want to do.",
    );
    if (id) root.append(el("p", "Choose one of the guides below."));
    if (!id)
      root.append(
        link(
          "First time? Set up Package Manager",
          "#guides/start",
          "button-link primary",
        ),
      );
    const cards = el("div", "", "guide-cards");
    for (const guide of guides) {
      const card = el("article", "", "guide-card");
      const title = el("h2");
      title.append(icon(guideIcons[guide.id]));
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
        "These labeled illustrations explain tasks; package names, versions, and screen layouts are examples, not evidence of vehicle compatibility.",
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
      "manager-source",
      "manager-versions",
      "vehicle-settings",
      "companion-registry",
      "registry-package",
      "publishing",
      "workflow",
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
  root.querySelector("h1")!.prepend(icon(guideIcons[chosen.id]));
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
      "Example only. Follow the instructions for your package and version.",
    ),
  );
  const example = el("details", "", "guide-example");
  example.append(el("summary", "Show an example screen"), figure);
  chosen.sections.forEach((section, index) => {
    const node = el("section", "", "guide-section");
    node.id = "guide-section-" + (index + 1);
    node.append(el("h2", section.title));
    const steps = el("ol");
    section.steps.forEach((text) => steps.append(guideText("li", text)));
    node.append(steps);
    if (section.note) node.append(guideText("aside", section.note, "callout"));
    article.append(node);
  });
  article.append(example);
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
