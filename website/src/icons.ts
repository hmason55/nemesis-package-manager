const paths = {
  search: "m21 21-5-5 M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14",
  package: "m12 3 9 5v9l-9 5-9-5V8l9-5 M3 8l9 5 9-5 M12 13v9 M7 5.8l9 5",
  filter: "M4 5h16 M7 12h10 M10 19h4",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  guide: "M12 6c-3-3-7-3-10-1v15c3-2 7-2 10 0c3-2 7-2 10 0V5c-3-2-7-2-10 1v14",
};
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
