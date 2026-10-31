# Detailed workflow reference

This optional reference collects the detailed Mermaid diagrams for the registry website, USB companion, vehicle app, USB files, and update handoffs. Start with the [illustrated user guide](USER-GUIDE.md) for numbered instructions and screen examples.

Screen maps group controls by purpose and follow their order from top to bottom; they are not exact screenshots. Arrows in a screen map show navigation or reading order, not automatic actions. These diagrams describe workflows and file organization; they are not code architecture diagrams.

## Overall handoff

```mermaid
flowchart LR
    registry["Registry website<br/>Find a published package and exact version"] --> companion["USB companion<br/>Download and verify, or import local ZIP"]
    local["Trusted local release ZIP"] --> companion
    registry --> cloud["Vehicle: Cloud Registry<br/>Choose release, download and verify"]
    cloud --> manager
    companion --> usb["USB drive<br/>Carry releases and data"]
    usb --> manager["Package Manager<br/>Choose action in vehicle"]
    manager --> nemesis["NEMESIS<br/>Apply action on head unit"]
```

| Reference topic | Diagram and explanation |
| --- | --- |
| Browse or publish releases online | [Registry website](#registry-website) |
| Find a control on the computer | [Companion screen](#companion-screen) |
| Find a package or action in the vehicle | [Package Manager screen](#package-manager-screen) |
| Understand which files go where | [USB drive layout](#usb-drive-layout) |
| Prepare a drive and install your first package | [First use](#first-use) |
| Replace a community package with a newer release | [Community package updates](#community-package-updates) |
| Update Package Manager itself | [Package Manager updates](#package-manager-updates) |
| Understand what happens to installers and data | [Installers and data](#installers-and-data) |

## Registry website

```mermaid
flowchart LR
    search["Packages: live search<br/>Category, publisher, maximum ZIP size, sort"] --> package["Package page<br/>Choose exact Version"]
    package --> read["Overview, Compatibility,<br/>Versions, Release notes, Integrity information"]
    read --> download["Download installer ZIP<br/>Import with companion; confirm in vehicle"]
    publish["Publish: GitHub sign-in<br/>Connect and register public repository"] --> asset["Choose published release and installer ZIP<br/>Confirm ID, version and redistribution permission"]
    asset --> validate["Waiting for validation then Validation in progress<br/>Trusted checks; no package code execution"]
    validate --> outcome{"Validation and authorization pass?"}
    outcome -->|Yes| live["Publish automatically<br/>No separate maintainer approval"]
    outcome -->|No| report["Private failure report<br/>Correct artifact or authorization"]
```

Browsing and downloading need no account. Profiles and compatibility declarations are advisory. Published bytes are immutable; changed bytes require a new version. Withdrawal hides a version; it does not release its version identity. To restore the original bytes, publishers use **Publish > My submissions > Republish version** for their own unpublishing, and administrators use **Manage registry > Republish version** for other withdrawals. Confirm the version and original hash and supply a reason; authorization, blocks, ownership, and artifact availability are rechecked. Stopped pending jobs stay stopped. See the [registry guide](REGISTRY-GUIDE.md) for numbered steps.

## Companion screen

Open the companion on your computer with the USB drive connected. Select the drive before choosing a task; check its path and available space so you know where files will be copied.

```mermaid
flowchart TB
    header["USB companion<br/>Settings | Guides | Quick guide"]
    header --> settings["Settings<br/>Drive not listed? | Automatic launch<br/>Registry address | Optional device profile"]
    drive["USB drive selector and Refresh<br/>Check path and available space"]
    summary["Drive summary and status<br/>Available space, Package Manager, launcher"]
    tabs["Tabs: Packages | Add / update | Drive setup"]
    header --- drive --- summary --- tabs
    tabs --- cloud["Cloud registry panel below USB workspace<br/>Live search | Filter results | Check USB updates<br/>Select exact versions and destination<br/>Prepare selected versions | Cancel downloads"]
    tabs --> packages["Packages<br/>Live search; filter installers, scripts, or issues<br/>Package | On USB | Type | Status<br/>Details / View issue<br/>Replace on USB | Remove | Add package"]
    tabs --> edit["Add / update<br/>Add a new package or<br/>Update an existing package<br/>Choose release ZIP and destination<br/>Add package or Update package"]
    tabs --> setup["Drive setup<br/>Choose manager release bundle<br/>USB version and newer-release link<br/>Set up drive, Update manager, or Repair manager"]
```

- **Packages** answers “what is on this drive?” **On USB** is the installer's version, not the version installed in the vehicle. **Needs attention** helps find layout errors; expand **View issue** to read them, or **Details** for other package information. **Replace on USB** opens the update form for a managed package.
- **Add / update** imports a downloaded release ZIP into a package folder. When adding, review the suggested folder name. When updating, choose the existing package so its old installer is replaced and its USB `data/` is kept.
- **Drive setup** takes `usb-package-manager-ready.zip`. A new drive offers **Set up drive**; an existing setup offers **Update manager**, or **Repair manager** if the installer is missing and the setup can be repaired. These actions prepare the USB copy; they do not update the app installed in the vehicle.

Loose installer ZIPs can be inspected and removed, but not replaced in place. Import a release into a managed folder for future companion updates. The companion does not format the drive, run package scripts or connect to the vehicle. See the [companion guide](USB-COMPANION.md#use-the-ui) for the full steps and supported downloads.

## Package Manager screen

After first setup, open **NEMESIS Manager > Packages > Package Manager > Launch**. Choose **Cloud Registry** or **USB Storage** at startup, or change the source in **Settings**. For USB, connect the prepared drive. Tap **Refresh** to read the selected source and installed state.

```mermaid
flowchart TB
    startup["Startup: Cloud Registry or USB Storage<br/>Don’t show again on startup | Continue"]
    startup --> header["Package Manager | Search packages<br/>Settings | Refresh | Help | Close"]
    header --> settings["Settings: source, registry address, optional profile<br/>Hide keyboard | Cancel | Save"]
    tabs["Tabs with counts<br/>Installed | Updates | Available | Scripts<br/>Clear search | Filters: type and sort"]
    list["Package list<br/>Name | Version<br/>One row per package ID; tap to select"]
    actions["Actions for the selected row<br/>Installed: Uninstall | Launch | Details<br/>Updates: Update | Details<br/>Available: Install | Details<br/>Scripts: Run script | Details"]
    header --- tabs --- list --- actions
    actions --> info["Details<br/>Versions, source paths,<br/>data and history paths, errors"]
    actions -->|Install or Update| versions["Multiple releases: choose version<br/>USB choices retain their own paths"]
    versions --> acquire["Cloud: download and verify selected release<br/>USB: use selected local installer"]
    acquire --> confirm["Review requirements and confirm installation"]
    info --> versions
    actions -->|Uninstall or Run script| direct["Review and confirm selected action"]
    direct --> wait
    confirm --> wait["For installs, updates, uninstalls, and scripts:<br/>wait for the operation overlay and result popup"]
    wait --> result["Read the result<br/>Open popup Details for diagnostic output"]
```

| Tab | What you find | What Version means |
| --- | --- | --- |
| **Installed** (opens first) | Packages installed on the head unit, including ones without an installer on this drive | Installed version |
| **Updates** | Installed packages with a confirmed newer release in the selected source | Installed to source version, such as `1.4 → 1.5` |
| **Available** | Installers whose IDs are not reported as installed | Selected source version |
| **Scripts** | USB tasks you can explicitly choose to run | USB version, or Unknown when absent |

A package with a confirmed update appears in both **Installed** and **Updates**, not **Available**. **Updates** compares installed versions with the selected USB or registry source. Installed management remains available offline; Scripts uses USB. If installed-state detection fails, read the error and tap **Refresh** to retry before interpreting the categories.

Only the actions for the active tab are shown. Installed leads with a yellow **Uninstall** button plus **Launch** and **Details**; Updates has **Update**, Available has **Install**, and Scripts has **Run script**, each with Details. Missing or unorderable versions do not enable a blind installation from Installed.

The overlay indicates activity, not percentage complete. Keep USB plugged in during installs and updates; wait for every action's result. Finish one operation before starting another in either Package Manager or NEMESIS Manager. Package Manager itself is excluded from these lists; see [its separate update path](#package-manager-updates).

## USB drive layout

Keep the manager's launcher at the root and each community release in its own folder under `packages/`. This lets one drive hold several installers and scripts without replacing the root launcher for each package.

```mermaid
flowchart LR
    usb["USB root"]
    usb --> descriptor["NEMESIS.data<br/>First-launch prompt<br/>Becomes NEMESIS.data.disabled unless automatic launch is enabled"]
    usb --> launcher["NEMESIS.sh<br/>Opens Package Manager; installs it if missing"]
    usb --> manager["manager/"]
    manager --> auto["auto-launch.enabled<br/>Present only when repeated automatic launch is enabled"]
    manager --> managerzip["usb.package.manager.zip<br/>Keep compressed"]
    usb --> packages["packages/"]
    packages --> example["Example/ - community installer bundle"]
    example --> wrapper["NEMESIS.data<br/>Describes this package's installer"]
    example --> payload["packages/example.zip<br/>Keep inner installer compressed"]
    example --> data["data/<br/>Package Manager history and any data kept here"]
    packages --> script["Example-Tool/ - script bundle"]
    script --> scriptfiles["NEMESIS.data, NEMESIS.sh, assets/<br/>Run only when selected and confirmed"]
```

The diagram shows example USB-ready layouts; actual inner filenames vary. Extract the outer release bundle into its package folder while leaving the inner installer ZIP compressed. When importing a raw internal installer ZIP into a managed folder, the companion/importer creates a folder-local wrapper for you. Community descriptors stay inside their package folders, not at the USB root. See [supported release layouts](RELEASE-LAYOUTS.md) for the other accepted forms and script limitations.

## First use

Download the [standalone companion for your computer](USB-COMPANION.md#run-a-release-download), [`usb-package-manager-ready.zip`](https://github.com/hmason55/nemesis-package-manager/releases/latest/download/usb-package-manager-ready.zip), and the trusted community releases you want from [Packages](https://hmason55.github.io/nemesis-package-manager/#packages). Check each package's vehicle and firmware requirements. The companion is optional; manual preparation and the source-checkout tools lead to the same in-vehicle steps.

```mermaid
flowchart LR
    subgraph computer["On your computer"]
        direction TB
        select["Open companion<br/>Select and check the USB drive"]
        select --> setup["Drive setup<br/>Choose usb-package-manager-ready.zip<br/>Confirm Set up drive"]
        setup --> add["Add / update<br/>Choose a community release ZIP<br/>Review folder and Add package"]
        add --> review["Packages<br/>Review copied releases and resolve errors"]
        review --> eject["Wait for copying to finish<br/>Safely eject the drive"]
    end
    subgraph car["In the parked vehicle"]
        direction TB
        vehicle["Head unit fully booted<br/>Insert USB and approve NEMESIS execution prompt"]
        vehicle --> open["Launcher installs Package Manager if missing<br/>and opens it"]
        open --> disable["After successful launch<br/>Root descriptor is backed up and disabled unless automatic launch is enabled"]
        disable --> install["Package Manager: choose USB Storage<br/>Refresh, then Available<br/>Select a package, review Details, confirm Install"]
        install --> result["Keep USB connected until the result popup<br/>On success, find the package in Installed"]
    end
    computer --> car
```

The first execution prompt starts the manager launcher; it does not install every community package. Choose and confirm those separately. Scripts are under **Scripts** and use **Run script** instead of installation.

On later visits, open **NEMESIS Manager > Packages > Package Manager > Launch**. The default disabled root descriptor prevents repeated execution prompts. Enabling automatic launch in companion Settings keeps it active instead. If Package Manager is already installed, the launcher opens it; replacing the manager ZIP does not update the installed app. See the [setup guide](SETUP-WINDOWS.md) for detailed preparation and troubleshooting.

## Community package updates

Updating has two separate steps: replace the installer on USB, then install that release in the vehicle. Choose the same package folder to preserve its USB `data/` and avoid keeping several old installers for the same package.

```mermaid
sequenceDiagram
    actor User
    participant PC as USB companion<br/>on computer
    participant USB as USB drive
    participant PM as Package Manager<br/>in vehicle
    participant HU as NEMESIS<br/>on head unit
    User->>PC: Select drive and package's<br/>Replace on USB action
    User->>PC: Choose release ZIP<br/>Confirm Update package
    PC->>USB: Replace installer files<br/>Preserve package data/
    PC-->>User: Copy result<br/>Vehicle is not updated yet
    User->>USB: Safely eject after copying<br/>Move drive to parked vehicle
    User->>PM: Open app and tap Refresh
    PM->>USB: Read USB installer version
    PM->>HU: Read installed package and version
    PM-->>User: Show confirmed newer release<br/>in Updates
    User->>PM: Review Details and confirm Update
    PM->>HU: Request installation<br/>of the USB release
    HU-->>PM: Return operation result
    PM-->>User: Result popup and diagnostic Details
```

This diagram follows a compatible release with a confirmed newer version. Missing or unorderable versions do not appear in Updates; check **Details** and the release instructions. If you see **Install**, check that you chose the correct package ID. A successful copy in the companion is not evidence of a successful head-unit update.

There is normally no need to uninstall first. Follow the author's backup and restart instructions, and inspect result **Details** if an update fails. See [Updating packages](UPDATING.md#update-another-package) for manual/command-line preparation, version rules, and recovery steps.

## Package Manager updates

Package Manager cannot manage itself. The companion's **Update manager** replaces the installer stored on your normal USB drive and keeps launcher settings; it does not cause the installed app to update on the next launch. Use NEMESIS's installer explicitly for the head-unit update.

```mermaid
flowchart TB
    download["Computer: download the new Package Manager release"]
    download --> normal["Normal package drive, companion Drive setup<br/>Choose usb-package-manager-ready.zip<br/>Confirm Update manager to refresh the stored installer"]
    download --> update["Separate update drive<br/>New usb.package.manager.zip, kept compressed<br/>Root NEMESIS.data pointing to it with type=install"]
    normal --> keep["Keep this drive's disabled launcher disabled<br/>Its stored manager ZIP is ready for future setup"]
    update --> close["In the parked vehicle: close Package Manager<br/>Insert update drive after head unit boots"]
    close --> confirm["Approve NEMESIS update prompt<br/>Wait for completion"]
    confirm --> reopen["NEMESIS Manager > Packages > Package Manager > Launch<br/>Return to the normal package drive"]
    keep -.-> reopen
```

Refreshing the stored installer and updating the installed app are separate tasks; either order is possible. The separate update drive uses an **install** descriptor, unlike the normal drive's first-launch **execute** descriptor. For the exact descriptor contents and filenames, follow [Update Package Manager](UPDATING.md#update-package-manager). Uninstall Package Manager through **NEMESIS Manager > Packages > Package Manager > Uninstall**.

## Installers and data

The USB installer, the installed head-unit package, and files saved by an app are separate things. Keeping one does not guarantee a backup of the others.

```mermaid
flowchart LR
    replace["Companion: update a package on USB"] --> installer["Installer files in that package folder<br/>Replaced with the chosen release"]
    replace --> usbdata["Existing package data/ on USB<br/>Preserved"]
    install["Package Manager: install or update"] --> headunit["Installed package on the head unit<br/>Changed through NEMESIS"]
    remove["Package Manager: uninstall a community package"] --> removed["Head-unit package<br/>Removed through NEMESIS"]
    remove --> kept["USB installer and package data/<br/>Kept"]
```

Package Manager saves operation history under the package's `data/` when available; **Details** gives the location. Third-party recordings, exports, and settings may live elsewhere. Neither app redirects those files or guarantees that package install hooks preserve head-unit settings. Keep independent backups and follow the package author's instructions.

If copying is interrupted, do not delete leftover hidden `.companion-*` directories until you have checked them for previous installers and data. See [companion files and recovery](USB-COMPANION.md#files-and-recovery) and [what updates preserve](UPDATING.md#what-is-preserved).

## Version comparison notes

Package Manager reads installed versions from `/data/nemesis/apps/<id>/NEMESIS.data` through NEMESIS using a fixed-length command that fits its command buffer regardless of package count. Numeric versions display without a leading `v`. Numeric dotted releases and numeric `-build.N` suffixes are compared numerically; older installers are disabled. Identical custom version strings are recognized as equal. A successful install also saves a fallback version in private app settings. Manifest metadata takes precedence; saved fallbacks are labeled in Details and may be stale after external changes. Missing or unorderable versions do not claim an update is available.


## Companion removal and launch preference

```mermaid
flowchart TD
    selected["Select USB and package"] --> remove["Remove from USB"]
    remove --> choice{"Delete this package's USB data too?"}
    choice -->|"No - default"| keep["Remove installer; keep data folder"]
    choice -->|"Yes - managed folder only"| all["Remove installer and data"]
    remove --> cancel["Cancel: no files changed"]
    keep --> vehicle["Head-unit installation stays unchanged"]
    all --> vehicle
    setup["Drive setup"] --> versions["Read USB manager version; check public releases"]
    versions --> newer{"Newer comparable release?"}
    newer -->|Yes| link["Open release page; download explicitly"]
    newer -->|No| current["Show current or unavailable comparison"]
    newer -->|"Offline or unknown"| retry["Keep USB management available; retry later"]
    settings["Settings: USB options"] --> toggle{"Run on USB insertion?"}
    toggle -->|On| active["Enable NEMESIS.data and persistent launch setting"]
    toggle -->|Off| disabled["Back up as NEMESIS.data.disabled; remove launch setting"]
```
