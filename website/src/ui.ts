import { element as el } from "./client";
export { el };
export function option(text: string, value: string) {
  const item = el("option", text);
  item.value = value;
  return item;
}
let sequence = 0;
export function action(text: string, handler: () => unknown, className = "") {
  const button = el("button", text, className);
  button.type = "button";
  button.onclick = () => void handler();
  return button;
}
export function link(text: string, href: string, className = "") {
  const a = el("a", text, className);
  a.href = href;
  return a;
}
export function external(text: string, href: string) {
  const a = link(text, href);
  a.rel = "noopener noreferrer";
  a.target = "_blank";
  return a;
}
export function inputField(
  parent: HTMLElement,
  label: string,
  name: string,
  type = "text",
  value = "",
  help = "",
) {
  const wrapper = el("div", "", "form-field"),
    id = "field-" + ++sequence,
    caption = el("label", label);
  const input = type === "textarea" ? el("textarea") : el("input");
  input.id = id;
  input.name = name;
  input.value = value;
  caption.htmlFor = id;
  if (input instanceof HTMLInputElement) input.type = type;
  wrapper.append(caption, input);
  if (help) {
    const hint = el("p", help, "hint");
    hint.id = id + "-help";
    input.setAttribute("aria-describedby", hint.id);
    wrapper.append(hint);
  }
  parent.append(wrapper);
  return input;
}
export function selectField(parent: HTMLElement, label: string) {
  const wrapper = el("div", "", "form-field"),
    select = el("select"),
    caption = el("label", label);
  select.id = "field-" + ++sequence;
  caption.htmlFor = select.id;
  wrapper.append(caption, select);
  parent.append(wrapper);
  return select;
}
export function checkField(parent: HTMLElement, text: string) {
  const label = el("label", "", "check-label"),
    input = el("input");
  input.type = "checkbox";
  label.append(input, el("span", text));
  parent.append(label);
  return input;
}
export function heading(parent: HTMLElement, title: string, subtitle = "") {
  const h1 = el("h1", title);
  parent.append(h1);
  if (subtitle) parent.append(el("p", subtitle, "lead"));
}
export function tags(values: string[]) {
  const group = el("div", "", "tags");
  for (const value of values) group.append(el("span", value, "tag"));
  return group;
}
export function size(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + " MiB"
    : Math.max(1, Math.ceil(bytes / 1024)) + " KiB";
}
export function date(seconds: number) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(seconds * 1000));
}
export function tabs(
  parent: HTMLElement,
  items: { name: string; content: HTMLElement }[],
) {
  const nav = el("div", "", "detail-tabs");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Package information");
  const buttons: HTMLButtonElement[] = [];
  function activate(index: number, focus = false) {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
      items[i].content.hidden = i !== index;
    });
    if (focus) buttons[index].focus();
  }
  items.forEach((item, index) => {
    const id = "tab-" + ++sequence,
      button = action(item.name, () => activate(index));
    button.id = id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", id + "-panel");
    item.content.id = id + "-panel";
    item.content.setAttribute("role", "tabpanel");
    item.content.setAttribute("aria-labelledby", id);
    item.content.tabIndex = 0;
    button.onkeydown = (event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % items.length;
      else if (event.key === "ArrowLeft")
        next = (index + items.length - 1) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else return;
      event.preventDefault();
      activate(next, true);
    };
    buttons.push(button);
    nav.append(button);
  });
  parent.append(nav, ...items.map((x) => x.content));
  activate(0);
  return activate;
}
