// Giro guidato della pagina cliente: lo schermo si scurisce e resta illuminato un elemento alla
// volta, con una frase accanto. Parte da solo alla prima visita e si riapre dal tasto «?».

export interface TourStep {
  title?: string;
  body: string;
  /** Elementi da illuminare (il riquadro li contiene tutti). Assente o vuoto: scheda al centro. */
  targets?: () => (Element | null)[];
  /** Prepara la pagina prima di mostrare il passo (apre un pannello, lo chiude…). */
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

/** true se il giro è già stato visto (o chiuso) in questo browser. */
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
    // Senza memoria del browser il giro si ripresenta alla prossima visita: va bene così.
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
      // Nessun elemento: buio uniforme e scheda al centro.
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
    // La scheda va dove c'è più posto: sotto, sopra, oppure di fianco a un elemento alto e stretto.
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
    // Un pannello che si apre o scorre sposta l'elemento: si rimisura a pagina ferma.
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
