// @vitest-environment happy-dom
import { it, expect, vi, afterEach } from "vitest";
import { searchControl } from "./search-control";
import { parseRoute, catalogLink } from "./routes";
import { api } from "./client";
import { renderCatalog } from "./catalog-view";
vi.mock("./client", async (original) => ({
  ...(await original<any>()),
  API: "https://registry.test",
  api: vi.fn(),
}));
afterEach(() => vi.useRealTimers());
it("debounces typing, sends Enter and clear immediately, and respects IME composition", async () => {
  vi.useFakeTimers();
  const input = document.createElement("input"),
    form = document.createElement("form"),
    clear = document.createElement("button");
  input.type = "search";
  document.body.replaceChildren(input, form, clear);
  const search = vi.fn(),
    invalidate = vi.fn();
  const control = searchControl(input, form, clear, invalidate, search);
  input.value = "a";
  input.dispatchEvent(new InputEvent("input"));
  await vi.advanceTimersByTimeAsync(150);
  input.value = "ab";
  input.dispatchEvent(new InputEvent("input"));
  await vi.advanceTimersByTimeAsync(249);
  expect(search).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(search).toHaveBeenLastCalledWith("ab");
  input.value = "abc";
  input.dispatchEvent(new InputEvent("input"));
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  expect(search).toHaveBeenLastCalledWith("abc");
  await vi.advanceTimersByTimeAsync(250);
  expect(search).toHaveBeenCalledTimes(2);
  clear.click();
  expect(search).toHaveBeenLastCalledWith("");
  expect(clear.hidden).toBe(true);
  expect(document.activeElement).toBe(input);
  input.value = "æ—¥æœ¬";
  input.dispatchEvent(new InputEvent("input", { isComposing: true }));
  await vi.advanceTimersByTimeAsync(300);
  expect(search).toHaveBeenCalledTimes(3);
  input.dispatchEvent(new Event("compositionend"));
  await vi.advanceTimersByTimeAsync(250);
  expect(search).toHaveBeenLastCalledWith("æ—¥æœ¬");
  control.cancel();
});
it("retains all catalog filters in deep links and pagination", () => {
  expect(
    parseRoute(
      catalogLink(
        "media & tools",
        "Utilities",
        "size",
        3,
        "Publisher",
        "10485760",
      ),
    ),
  ).toEqual({
    page: "packages",
    query: "media & tools",
    category: "Utilities",
    sort: "size",
    number: 3,
    publisher: "Publisher",
    maxSize: "10485760",
  });
});
it("keeps active mobile filters compact until opened and preserves a manual open state", () => {
  const media = vi
    .spyOn(window, "matchMedia")
    .mockReturnValue({ matches: true } as MediaQueryList);
  try {
    const root = document.createElement("div");
    const data = { packages: [], categories: ["Utilities"], total: 0 };
    renderCatalog(root, data, "", "Utilities", "name", 1, vi.fn());
    expect(
      root.querySelector<HTMLDetailsElement>("[data-catalog-filters]")?.open,
    ).toBe(false);
    expect(root.querySelector("summary")?.textContent).toContain("1 active");
    root.replaceChildren();
    renderCatalog(root, data, "", "Utilities", "name", 1, vi.fn(), {
      filterOpen: true,
    });
    expect(
      root.querySelector<HTMLDetailsElement>("[data-catalog-filters]")?.open,
    ).toBe(true);
  } finally {
    media.mockRestore();
  }
});
it("changes every filter immediately and retains filters on pagination links", () => {
  const root = document.createElement("div"),
    navigate = vi.fn();
  renderCatalog(
    root,
    {
      packages: [],
      categories: ["Utilities"],
      publishers: ["owner"],
      total: 0,
      next_page: 2,
    },
    "media",
    "Utilities",
    "size",
    1,
    navigate,
    { publisher: "owner", maxSize: "10485760" },
  );
  const publisher = root.querySelector<HTMLSelectElement>(
    '[data-catalog-control="publisher"]',
  )!;
  publisher.value = "";
  publisher.dispatchEvent(new Event("change"));
  expect(parseRoute(navigate.mock.calls.at(-1)![0])).toEqual({
    page: "packages",
    query: "media",
    category: "Utilities",
    sort: "size",
    number: 1,
    publisher: "",
    maxSize: "10485760",
  });
  const maximum = root.querySelector<HTMLSelectElement>(
    '[data-catalog-control="max-size"]',
  )!;
  maximum.value = "52428800";
  maximum.dispatchEvent(new Event("change"));
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(
    root
      .querySelector<HTMLAnchorElement>('[aria-label="Package result pages"] a')
      ?.getAttribute("href"),
  ).toContain("publisher=owner&max_size=10485760");
  const sort = root.querySelector<HTMLSelectElement>(
    '[data-catalog-control="sort"]',
  )!;
  sort.value = "recent";
  sort.dispatchEvent(new Event("change"));
  expect(parseRoute(navigate.mock.calls.at(-1)![0])).toMatchObject({
    sort: "recent",
    publisher: "",
    maxSize: "52428800",
    number: 1,
  });
});
it("keeps live search focus/caret and history stable and discards superseded results and errors", async () => {
  vi.useFakeTimers();
  history.replaceState(null, "", "/#packages");
  document.body.innerHTML =
    '<nav><a id="browse"></a><a id="publish"></a><a id="moderate"></a><a id="help"></a><a id="settings"></a><a id="settings"></a></nav><form id="search"><input id="search-query" type="search"><button id="search-clear" type="button"></button><button id="search-submit" type="submit">Search</button></form><span id="search-status"></span><button id="signin"></button><button id="signout"></button><button id="theme"></button><div id="notice"></div><main id="content" tabindex="-1"></main>';
  const data = (name: string) => ({
    packages: [{ id: name, name, description: "Description" }],
    publishers: ["owner"],
    categories: ["Utilities"],
    total: 1,
    next_page: 2,
  });
  vi.mocked(api).mockResolvedValueOnce(data("initial"));
  await import("./main");
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  await flush();
  const input = document.getElementById("search-query") as HTMLInputElement;
  input.focus();
  const length = history.length;
  let rejectOld!: (error: Error) => void;
  vi.mocked(api).mockImplementationOnce(
    () => new Promise((_, reject) => (rejectOld = reject)),
  );
  input.value = "old";
  input.dispatchEvent(new InputEvent("input"));
  await vi.advanceTimersByTimeAsync(250);
  let resolveNew!: (value: any) => void;
  vi.mocked(api).mockImplementationOnce(
    () => new Promise((resolve) => (resolveNew = resolve)),
  );
  input.value = "new";
  input.setSelectionRange(1, 1);
  input.dispatchEvent(new InputEvent("input"));
  await vi.advanceTimersByTimeAsync(250);
  resolveNew(data("new-result"));
  await flush();
  rejectOld(new Error("obsolete failure"));
  await flush();
  expect(document.getElementById("content")?.textContent).toContain(
    "new-result",
  );
  expect(document.body.textContent).not.toContain("obsolete failure");
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(1);
  expect(input.value).toBe("new");
  expect(history.length).toBe(length);
  expect(location.hash).toContain("q=new");
  let resolveOld!: (value: any) => void;
  vi.mocked(api).mockImplementationOnce(
    () => new Promise((resolve) => (resolveOld = resolve)),
  );
  input.value = "stale";
  input.dispatchEvent(new InputEvent("input"));
  await vi.advanceTimersByTimeAsync(250);
  input.value = "latest";
  input.dispatchEvent(new InputEvent("input"));
  resolveOld(data("obsolete-result"));
  await flush();
  expect(document.getElementById("content")?.textContent).not.toContain(
    "obsolete-result",
  );
  vi.mocked(api).mockResolvedValueOnce(data("latest-result"));
  await vi.advanceTimersByTimeAsync(250);
  await flush();
  expect(document.getElementById("content")?.textContent).toContain(
    "latest-result",
  );
  const category = document.querySelector<HTMLSelectElement>(
    '[data-catalog-control="category"]',
  )!;
  category.value = "Utilities";
  category.focus();
  vi.mocked(api).mockResolvedValueOnce(data("filtered"));
  category.dispatchEvent(new Event("change"));
  await flush();
  expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toContain("category=Utilities");
  expect(location.hash).toContain("q=latest");
  expect((document.activeElement as HTMLElement).dataset.catalogControl).toBe(
    "category",
  );
});
