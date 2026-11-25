import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { CatalogView } from "../src/components/catalog/CatalogView";
import { click, eventually, mount } from "./support/react";
import { json, request, stickerRow } from "./support/supabase";

vi.mock("../src/lib/supabaseClient", async () => ({ supabase: (await import("./support/supabase")).supabase }));

test("evita mostrar el catálogo anterior y reinicia la selección al cambiar de inventario", async () => {
  let loadSeller: (response: Response) => void = () => undefined;
  request.mockImplementation(async (input) => {
    const url = new URL(String(input));
    switch (url.pathname) {
      case "/rest/v1/catalog_sellers":
        if (url.searchParams.get("slug") === "eq.catalogo-am") {
          return new Promise((resolve) => { loadSeller = resolve; });
        }
        return json([{ inventario: "CN" }]);
      case "/rest/v1/catalog_stickers":
        return json([stickerRow(3, { nombre: url.searchParams.get("inventario") === "eq.CN" ? "Catálogo CN" : "Catálogo AM" })]);
      case "/rest/v1/teams":
        return json([{ code: "MEX", name: "México" }]);
      case "/rest/v1/category_prices":
        return json([]);
      default:
        throw new Error(`Ruta de prueba imprevista: ${url.pathname}`);
    }
  });
  const { container } = await mount(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/laminas/catalogo-cn"]}>
        <Link to="/laminas/catalogo-am">Cambiar catálogo</Link>
        <Routes><Route path="/laminas/:slug" element={<CatalogView />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const sticker = () => container.querySelector<HTMLButtonElement>("button[aria-pressed]");
  await eventually(() => expect(sticker()?.textContent).toContain("Catálogo CN"));
  await click(sticker());
  expect(sticker()?.getAttribute("aria-pressed")).toBe("true");

  await click(container.querySelector("a[href='/laminas/catalogo-am']"));
  expect(container.textContent).toContain("Cargando catálogo…");
  expect(sticker()).toBeNull();
  await act(async () => loadSeller(json([{ inventario: "AM" }])));
  await eventually(() => expect(sticker()?.textContent).toContain("Catálogo AM"));
  expect(sticker()?.getAttribute("aria-pressed")).toBe("false");
});
