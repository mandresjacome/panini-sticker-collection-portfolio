import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, vi } from "vitest";

const cleanup = new Set<() => void>();
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(async () => {
  await act(async () => {
    for (const unmount of cleanup) unmount();
    cleanup.clear();
  });
});

export async function mount(element: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const unmount = () => { root.unmount(); container.remove(); };
  cleanup.add(unmount);
  const render = (next: ReactNode) => act(async () => { root.render(next); });
  await render(element);
  return { container, render };
}

export async function eventually(assertion: () => void) {
  const deadline = Date.now() + 2000;
  while (true) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
  }
}

export async function click(element: HTMLElement | null) {
  if (!element) throw new Error("No se encontró el control de prueba.");
  await act(async () => { element.click(); });
}
