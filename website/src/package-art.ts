import { icon } from "./icons";
export function packageArt(parent: HTMLElement, pkg: any) {
  const fallback = () => {
    parent.replaceChildren(icon("package"));
  };
  fallback();
  const urls: string[] = [];
  const valid = (value: unknown) => {
    try {
      const u = new URL(String(value));
      return u.protocol === "https:" && !u.username && !u.password
        ? u.href
        : null;
    } catch {
      return null;
    }
  };
  const custom = valid(pkg.icon_url);
  if (custom) urls.push(custom);
  // Only GitHub's image host may be used for an API-provided avatar URL.
  const avatar = valid(pkg.avatar_url);
  if (avatar && new URL(avatar).hostname === "avatars.githubusercontent.com")
    urls.push(avatar);
  else if (
    typeof pkg.publisher === "string" &&
    /^[A-Za-z0-9-]{1,39}$/.test(pkg.publisher)
  )
    urls.push(
      "https://avatars.githubusercontent.com/" +
        encodeURIComponent(pkg.publisher) +
        "?s=80",
    );
  function next() {
    const url = urls.shift();
    if (!url) {
      fallback();
      return;
    }
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.width = image.height = 48;
    image.onerror = next;
    image.src = url;
    parent.replaceChildren(image);
  }
  if (urls.length) next();
}
