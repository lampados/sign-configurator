// Guided tour of the customer page: the screen darkens and one element at a time stays
// highlighted, with a sentence next to it. It starts by itself at the first visit and reopens from the "?" button.

export interface TourStep {
  title?: string;
  body: string;
  /** Elements to highlight (the box contains them all). Absent or empty: card in the centre. */
  targets?: () => (Element | null)[];
  /** Prepares the page before showing the step (opens a panel, closes it…). */
  before?: () => void;
}

export interface TourLabels {
  aria: string;
  skip: string;
  back: string;
  next: string;
  done: string;
}

const SEEN_KEY = 'ciao-tour-seen';
const PAD = 6;
const GAP = 12;

/** true if the tour has already been seen (or closed) in this browser. */
export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Without browser storage the tour shows again at the next visit: that is fine.
  }
}

let closeCurrent: (() => void) | null = null;

export function startTour(steps: readonly TourStep[], labels: TourLabels): void {
  closeCurrent?.();
  if (steps.length === 0) return;

  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <div class="tour-hole"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-label="${labels.aria}">
      <p class="tour-count"></p>
      <h2 class="tour-title"></h2>
      <p class="tour-body"></p>
      <div class="tour-actions">
        <button type="button" class="tour-skip">${labels.skip}</button>
        <button type="button" class="tour-back">${labels.back}</button>
        <button type="button" class="tour-next"></button>
      </div>
    </div>`;
  document.body.append(root);

  const hole = root.querySelector<HTMLElement>('.tour-hole')!;
  const card = root.querySelector<HTMLElement>('.tour-card')!;
  const count = root.querySelector<HTMLElement>('.tour-count')!;
  const title = root.querySelector<HTMLElement>('.tour-title')!;
  const body = root.querySelector<HTMLElement>('.tour-body')!;
  const skip = root.querySelector<HTMLButtonElement>('.tour-skip')!;
  const back = root.querySelector<HTMLButtonElement>('.tour-back')!;
  const next = root.querySelector<HTMLButtonElement>('.tour-next')!;
  let index = 0;

  const place = (): void => {
    const step = steps[index]!;
    const rects = (step.targets?.() ?? [])
      .filter((el): el is Element => el !== null)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(320, vw - 2 * GAP);
    card.style.width = `${cardW}px`;
    if (rects.length === 0) {
      // No element: uniform dark and card in the centre.
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      card.style.left = `${(vw - cardW) / 2}px`;
      card.style.top = `${Math.max(GAP, (vh - card.offsetHeight) / 2)}px`;
      return;
    }
    const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - PAD);
    const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - PAD);
    const right = Math.min(vw, Math.max(...rects.map((r) => r.right)) + PAD);
    const bottom = Math.min(vh, Math.max(...rects.map((r) => r.bottom)) + PAD);
    hole.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px`;
    // The card goes where there is most room: below, above, or beside a tall narrow element.
    const cardH = card.offsetHeight;
    const clampX = (x: number): number => Math.max(GAP, Math.min(x, vw - cardW - GAP));
    const clampY = (y: number): number => Math.max(GAP, Math.min(y, vh - cardH - GAP));
    let x = clampX((left + right) / 2 - cardW / 2);
    let y: number;
    if (vh - bottom >= cardH + 2 * GAP) y = bottom + GAP;
    else if (top >= cardH + 2 * GAP) y = top - cardH - GAP;
    else if (left >= cardW + 2 * GAP) {
      x = left - cardW - GAP;
      y = clampY((top + bottom) / 2 - cardH / 2);
    } else if (vw - right >= cardW + 2 * GAP) {
      x = right + GAP;
      y = clampY((top + bottom) / 2 - cardH / 2);
    } else y = clampY(vh - cardH - GAP);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  };

  const show = (): void => {
    const step = steps[index]!;
    step.before?.();
    count.textContent = `${index + 1} / ${steps.length}`;
    title.textContent = step.title ?? '';
    title.hidden = !step.title;
    body.textContent = step.body;
    back.hidden = index === 0;
    next.textContent = index === steps.length - 1 ? labels.done : labels.next;
    skip.hidden = index === steps.length - 1;
    place();
    // A panel that opens or scrolls moves the element: it is measured again once the page is still.
    window.setTimeout(place, 350);
    next.focus({ preventScroll: true });
  };

  const close = (): void => {
    markSeen();
    window.removeEventListener('resize', place);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    closeCurrent = null;
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowRight') next.click();
    else if (event.key === 'ArrowLeft' && index > 0) back.click();
  };

  skip.addEventListener('click', close);
  back.addEventListener('click', () => {
    index = Math.max(0, index - 1);
    show();
  });
  next.addEventListener('click', () => {
    if (index === steps.length - 1) return close();
    index += 1;
    show();
  });
  window.addEventListener('resize', place);
  window.addEventListener('keydown', onKey, true);
  closeCurrent = close;
  show();
}
