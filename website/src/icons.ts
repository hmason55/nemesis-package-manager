const paths = {
  search: "m21 21-5-5 M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14",
  package: "m12 3 9 5v9l-9 5-9-5V8l9-5 M3 8l9 5 9-5 M12 13v9 M7 5.8l9 5",
  filter: "M4 5h16 M7 12h10 M10 19h4",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  guide: "M12 6c-3-3-7-3-10-1v15c3-2 7-2 10 0c3-2 7-2 10 0V5c-3-2-7-2-10 1v14",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  copy: "M8 8h12v13H8z M16 8V3H3v13h5",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5.5 7a8 8 0 0 1 13-2L20 7 M4 17l1.5 2a8 8 0 0 0 13-2",
  restore: "M4 4v6h6 M4 10a8 8 0 1 1 1 9",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3 M8 12h8",
  save: "M4 3h13l4 4v14H3V3h1 M7 3v6h10V3 M7 21v-8h10v8",
  upload: "M12 16V3 m-5 5 5-5 5 5 M4 16v5h16v-5",
  settings:
    "m9 3-.5 3-2 1-3-.5-1.5 3L4 12l-2 2.5 1.5 3 3-.5 2 1 .5 3h6l.5-3 2-1 3 .5 1.5-3L20 12l2-2.5-1.5-3-3 .5-2-1L15 3z M15 12a3 3 0 1 0-6 0a3 3 0 0 0 6 0",
  signin: "M14 3h7v18h-7 M3 12h13 m-5-5 5 5-5 5",
  signout: "M10 3H3v18h7 M9 12h12 m-5-5 5 5-5 5",
  sun: "M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 0-8 0a4 4 0 0 0 8 0",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
  close: "m6 6 12 12 M6 18 18 6",
  back: "M19 12H5 m6-6-6 6 6 6",
  repository: "M4 3h16v18H6a2 2 0 0 1 0-4h14 M4 3v16 M8 7h8 M8 11h5",
  usb: "M7 9h10v12H7z M9 9V3h6v6 M11 5v2 M13 5v2",
  cloud:
    "M7 17H6a4 4 0 0 1 0-8 6 6 0 0 1 11-2 5 5 0 0 1 1 10h-1 M12 12v9 m-3-3 3 3 3-3",
  car: "m4 10 2-6h12l2 6 M3 10h18v8H3z M5 18v3 M19 18v3 M6 14h2 M16 14h2",
};
export type IconName = keyof typeof paths;
const actions: Record<string, IconName> = {
  "Download installer ZIP": "download",
  "Copy download link": "copy",
  "Refresh status": "refresh",
  "Try again": "refresh",
  "Retry validation": "refresh",
  "Republish version": "restore",
  "Unpublish package": "trash",
  "Remove package": "trash",
  "Block repository owner": "shield",
  "Block submitting user": "shield",
  "Unblock publisher": "restore",
  "Save profile": "save",
  "Clear profile": "close",
  "Register repository": "repository",
  "Sign in with GitHub": "signin",
  "Sign out": "signout",
  Continue: "arrow",
  "Submit for validation": "upload",
  Back: "back",
  Clear: "close",
  "Use light theme": "sun",
  "Use dark theme": "moon",
};
export function labelAction(
  node: HTMLElement,
  text: string,
  name = actions[text],
) {
  node.replaceChildren(text);
  if (name) node.prepend(icon(name));
  return node;
}
export function icon(name: keyof typeof paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ui-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  return svg;
}
