/** Debounce only ordinary typing; explicit submit and clear stay immediate. */
export function searchControl(
  input: HTMLInputElement,
  form: HTMLFormElement,
  clear: HTMLButtonElement,
  invalidate: () => void,
  search: (query: string) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const updateClear = () => {
    clear.hidden = !input.value;
  };
  const immediate = () => {
    cancel();
    invalidate();
    updateClear();
    search(input.value.trim());
  };
  const typing = (event: Event) => {
    cancel();
    invalidate();
    updateClear();
    if (!(event as InputEvent).isComposing)
      timer = setTimeout(() => search(input.value.trim()), 250);
  };
  input.addEventListener("input", typing);
  input.addEventListener("compositionend", typing);
  form.onsubmit = (event) => {
    event.preventDefault();
    immediate();
  };
  clear.onclick = () => {
    input.value = "";
    input.focus();
    immediate();
  };
  updateClear();
  return { cancel, updateClear };
}
