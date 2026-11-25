import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";
import XLSX from "xlsx-js-style";
import { DashboardView } from "../src/components/dashboard/DashboardView";
import { useCategoryPrices } from "../src/hooks/useCategoryPrices";
import { updateCategoryPrice } from "../src/services/categoryPriceService";
import { click, eventually, mount } from "./support/react";
import { json, request, stickerRow } from "./support/supabase";

vi.mock("../src/lib/supabaseClient", async () => ({ supabase: (await import("./support/supabase")).supabase }));
vi.mock("xlsx-js-style", async (load) => {
  const { default: actual } = await load<{ default: typeof XLSX }>();
  return { default: { ...actual, writeFile: vi.fn() } };
});

function Prices() {
  const { categoryPrices, updateCategoryPrice } = useCategoryPrices();
  return (
    <>
      <output>{categoryPrices.BASICA}</output>
      <button onClick={() => void updateCategoryPrice("BASICA", 2750)}>Guardar</button>
    </>
  );
}

test("guarda el precio base mediante UPSERT y actualiza la caché compartida", async () => {
  let price = 1250;
  request.mockImplementation(async (input, init) => {
    expect(new URL(String(input)).pathname).toBe("/rest/v1/category_prices");
    if (init?.method === "POST") {
      expect(new Headers(init.headers).get("Prefer")).toContain("resolution=merge-duplicates");
      expect(JSON.parse(String(init.body))).toEqual({ category: "BASICA", price: 2750 });
      price = 2750;
      return new Response(null, { status: 201 });
    }
    return json([{ category: "BASICA", price }]);
  });
  const client = new QueryClient();
  const { container } = await mount(<QueryClientProvider client={client}><Prices /></QueryClientProvider>);
  const output = () => container.querySelector("output")?.textContent;
  await eventually(() => expect(output()).toBe("1250"));
  await click(container.querySelector("button"));
  await eventually(() => expect(output()).toBe("2750"));
  expect(client.getQueryData(["category_prices"])).toMatchObject({ BASICA: 2750 });
});

test("valida precios enteros no negativos y conserva el error de permisos del servidor", async () => {
  for (const price of [-1, 1.25, NaN, Infinity]) {
    await expect(updateCategoryPrice("BASICA", price)).rejects.toThrow("entero no negativo");
  }
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(json({ code: "42501", message: "permission denied" }, 403));
  await expect(updateCategoryPrice("BASICA", 0)).rejects.toThrow("permission denied");
  expect(request).toHaveBeenCalledOnce();
});

function dashboard(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route path="/admin" element={<Outlet context={{ userId: "test", inventario: "CN" }} />}>
            <Route path="dashboard" element={<DashboardView />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

test("exporta las tres hojas con los precios vigentes y respeta precios individuales y totales", async () => {
  vi.mocked(XLSX.writeFile).mockClear();
  let price = 1250;
  request.mockImplementation(async (input) => {
    const table = new URL(String(input)).pathname.split("/").at(-1);
    if (table === "category_prices") return json([{ category: "BASICA", price }]);
    if (table === "teams") return json([{ code: "MEX", name: "México" }]);
    expect(table).toBe("stickers");
    return json([
      stickerRow(2),
      stickerRow(3, { codigo: "MEX3", precio: 700 }),
      stickerRow(1, { codigo: "MEX4", precio: 0 }),
      stickerRow(0, { codigo: "MEX5", estado: "F" }),
    ]);
  });
  const client = new QueryClient();
  const { container } = await mount(dashboard(client));
  const exportButton = () => container.querySelector<HTMLButtonElement>("button[title*='Excel']");
  await eventually(() => {
    expect(exportButton()?.disabled).toBe(false);
    expect(client.getQueryData(["category_prices"])).toMatchObject({ BASICA: 1250 });
  });

  price = 3200;
  await click(exportButton());
  await eventually(() => expect(XLSX.writeFile).toHaveBeenCalledOnce());
  const [workbook, filename] = vi.mocked(XLSX.writeFile).mock.calls[0];
  expect(filename).toMatch(/^laminas-disponibles_.*\.xlsx$/);
  const binary = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const saved = XLSX.read(binary, { type: "buffer" });
  expect(saved.SheetNames).toEqual(["Matriz", "Por Categoría", "Resumen por Equipo"]);
  expect(XLSX.utils.sheet_to_json(saved.Sheets["Por Categoría"])).toMatchObject([
    { Código: "MEX2", "Cant.": 2, "Precio Unit.": 3200, "Valor Total": 6400 },
    { Código: "MEX3", "Cant.": 3, "Precio Unit.": 700, "Valor Total": 2100 },
    { Código: "MEX4", "Cant.": 1, "Precio Unit.": 0, "Valor Total": 0 },
  ]);
  expect(XLSX.utils.sheet_to_json(saved.Sheets["Resumen por Equipo"])).toMatchObject([
    { Equipo: "MEX", "Unidades Totales": 6, "Valor Potencial": 8500 },
    { Equipo: "TOTAL", "Unidades Totales": 6, "Valor Potencial": 8500 },
  ]);
  expect(XLSX.utils.sheet_to_json(saved.Sheets.Matriz)).toMatchObject([{ Equipo: "MEX", "2": 2, "3": 3, "4": 1 }]);
});

test("cancela la descarga pendiente al salir del panel", async () => {
  vi.mocked(XLSX.writeFile).mockClear();
  let exportSignal: AbortSignal | null | undefined;
  let finishExport: (response: Response) => void = () => undefined;
  let priceReads = 0;
  request.mockImplementation(async (input, init) => {
    const table = new URL(String(input)).pathname.split("/").at(-1);
    if (table === "category_prices") {
      if (priceReads++ === 0) return json([]);
      exportSignal = init?.signal;
      return new Promise((resolve) => { finishExport = resolve; });
    }
    expect(table).toBe("stickers");
    return json([stickerRow(2)]);
  });
  const client = new QueryClient();
  const { container, render } = await mount(dashboard(client));
  const exportButton = () => container.querySelector<HTMLButtonElement>("button[title*='Excel']");
  await eventually(() => {
    expect(exportButton()?.disabled).toBe(false);
    expect(client.getQueryData(["category_prices"])).toBeDefined();
  });
  await click(exportButton());
  await eventually(() => expect(exportSignal?.aborted).toBe(false));
  await render(null);
  expect(exportSignal?.aborted).toBe(true);
  await act(async () => finishExport(json([])));
  expect(XLSX.writeFile).not.toHaveBeenCalled();
});
