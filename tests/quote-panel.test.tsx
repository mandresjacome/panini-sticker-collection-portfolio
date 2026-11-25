import { afterEach, expect, test, vi } from "vitest";
import { QuotePanel } from "../src/components/ui/QuotePanel";
import { mount } from "./support/react";

const demoNumber = "12025550100";
const message = "Cotización de prueba\nMEX2 ×2";

function panel(showPrices = true) {
  return <QuotePanel
    count={2} total={2000} whatsappText={message} expanded showPrices={showPrices}
    onClear={() => undefined} onToggleExpand={() => undefined}
  />;
}

afterEach(() => vi.unstubAllEnvs());

test("abre WhatsApp con el contacto configurado y el mensaje codificado", async () => {
  vi.stubEnv("VITE_WHATSAPP_NUMBER", demoNumber);
  const { container } = await mount(panel());
  const link = container.querySelector<HTMLAnchorElement>("a");
  expect(link?.getAttribute("href")).toBe(`https://wa.me/${demoNumber}?text=${encodeURIComponent(message)}`);
  expect(link?.target).toBe("_blank");
});

test.each([undefined, "", "+1 (202) 555-0100"])(
  "conserva la opción de copiar sin generar un enlace para un contacto ausente o inválido (%s)",
  async (value) => {
    vi.stubEnv("VITE_WHATSAPP_NUMBER", value);
    const { container } = await mount(panel());
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("Copiar");
  },
);

test("mantiene la lista sin WhatsApp cuando el catálogo oculta los precios", async () => {
  vi.stubEnv("VITE_WHATSAPP_NUMBER", demoNumber);
  const { container } = await mount(panel(false));
  expect(container.querySelector("a")).toBeNull();
  expect(container.textContent).toContain("Copiar");
});
