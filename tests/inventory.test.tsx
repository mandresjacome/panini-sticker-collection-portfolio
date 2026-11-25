import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { AdminLayout } from "../src/components/admin/AdminLayout";
import { useStickers } from "../src/hooks/useStickers";
import { fetchAllStickers, updateSticker } from "../src/services/stickerService";
import { click, eventually, mount } from "./support/react";
import { channels, json, request, sessionChange, stickerRow } from "./support/supabase";

vi.mock("../src/lib/supabaseClient", async () => ({ supabase: (await import("./support/supabase")).supabase }));

function Inventory({ view }: { view: string }) {
  const { stickersArray, updateStickerFields } = useStickers();
  return (
    <>
      <output id="inventory">{view}:{stickersArray[0]?.quantity ?? ""}</output>
      <button id="update-stock" onClick={() => void updateStickerFields("MEX2", { quantity: 12 })}>Actualizar</button>
    </>
  );
}

function MatrixInventory() { return <Inventory view="matriz" />; }
function DashboardInventory() { return <Inventory view="dashboard" />; }

function panel(client: QueryClient) {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<MatrixInventory />} />
              <Route path="dashboard" element={<DashboardInventory />} />
            </Route>
            <Route path="/admin/login" element={<p>Inicio de sesión</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}

test("mantiene Realtime al navegar y aísla cuentas, inventarios y sesiones", async () => {
  const quantities = { CN: 4, AM: 9 };
  request.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/inventory_memberships")) {
      const user = url.searchParams.get("user_id");
      return json(user === "eq.cn" || user === "eq.cn-other" ? [{ inventario: "CN" }] : user === "eq.am" ? [{ inventario: "AM" }] : []);
    }
    expect(url.pathname).toBe("/rest/v1/stickers");
    if (init?.method === "PATCH") {
      expect(url.searchParams.get("inventario")).toBe("eq.AM");
      expect(JSON.parse(String(init.body))).toEqual({ cantidad: 12 });
      quantities.AM = 12;
      return json(stickerRow(12));
    }
    return json([stickerRow(url.searchParams.get("inventario") === "eq.CN" ? quantities.CN : quantities.AM)]);
  });
  sessionChange("SIGNED_IN", "cn");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = await mount(panel(client));
  const stock = () => container.querySelector("#inventory")?.textContent;
  await eventually(() => expect(stock()).toBe("matriz:4"));
  const cnChannel = channels.at(-1)!;
  expect(cnChannel.filter).toBe("inventario=eq.CN");
  quantities.CN = 5;
  await act(async () => cnChannel.status?.("SUBSCRIBED"));
  await eventually(() => expect(stock()).toBe("matriz:5"));
  quantities.CN = 6;
  await act(async () => cnChannel.update(stickerRow(6)));
  await eventually(() => expect(stock()).toBe("matriz:6"));

  await click(container.querySelector("a[href='/admin/dashboard']"));
  await eventually(() => expect(stock()).toBe("dashboard:6"));
  expect(cnChannel.closed).toBe(true);
  const dashboardChannel = channels.at(-1)!;
  expect(dashboardChannel).not.toBe(cnChannel);

  quantities.CN = 7;
  await act(async () => sessionChange("SIGNED_IN", "cn-other"));
  expect(stock()).not.toBe("dashboard:6");
  await eventually(() => expect(stock()).toBe("dashboard:7"));
  expect(dashboardChannel.closed).toBe(true);
  const sameInventoryChannel = channels.at(-1)!;
  expect(sameInventoryChannel.filter).toBe("inventario=eq.CN");

  await act(async () => sessionChange("SIGNED_IN", "am"));
  expect(stock()).not.toBe("dashboard:7");
  await eventually(() => expect(stock()).toBe("dashboard:9"));
  expect(sameInventoryChannel.closed).toBe(true);
  expect(channels.at(-1)?.filter).toBe("inventario=eq.AM");
  await act(async () => sameInventoryChannel.update(stickerRow(99)));
  expect(stock()).toBe("dashboard:9");
  await click(container.querySelector("#update-stock"));
  await eventually(() => expect(stock()).toBe("dashboard:12"));
  expect(client.getQueryData(["stickers", "cn", "CN"])).toMatchObject({ MEX2: { quantity: 6 } });
  expect(client.getQueryData(["stickers", "cn-other", "CN"])).toMatchObject({ MEX2: { quantity: 7 } });

  await act(async () => sessionChange("SIGNED_IN", "without-membership"));
  await eventually(() => expect(container.textContent).toContain("Tu cuenta no tiene un inventario asignado"));
  expect(stock()).toBeUndefined();
  await act(async () => sessionChange("SIGNED_OUT", null));
  await eventually(() => expect(container.textContent).toContain("Inicio de sesión"));
  expect(channels.every((channel) => channel.closed)).toBe(true);
});

test("descarta una lectura inicial anterior a un evento de Realtime", async () => {
  let firstSnapshotStarted = false;
  let completeOldSnapshot: (response: Response) => void = () => undefined;
  request.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/inventory_memberships")) return json([{ inventario: "CN" }]);
    if (firstSnapshotStarted) return json([stickerRow(8)]);
    firstSnapshotStarted = true;
    return new Promise((resolve) => { completeOldSnapshot = resolve; });
  });
  sessionChange("SIGNED_IN", "cn");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = await mount(panel(client));
  await eventually(() => expect(firstSnapshotStarted).toBe(true));
  await act(async () => channels.at(-1)?.update(stickerRow(8)));
  await eventually(() => expect(container.querySelector("#inventory")?.textContent).toBe("matriz:8"));
  await act(async () => completeOldSnapshot(json([stickerRow(2)])));
  expect(container.querySelector("#inventory")?.textContent).toBe("matriz:8");
});

test("carga y modifica por inventario y acepta transiciones de cantidad válidas", async () => {
  request.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("inventario")).toBe("eq.AM");
    if (init?.method === "PATCH") {
      expect(url.searchParams.get("codigo")).toBe("eq.MEX2");
      return json(stickerRow(0, JSON.parse(String(init.body))));
    }
    return json([stickerRow(3), stickerRow(0, { codigo: "MEX3", estado: "V" })]);
  });
  await expect(fetchAllStickers("AM")).resolves.toMatchObject({ MEX2: { quantity: 3 }, MEX3: { status: "F" } });
  await expect(updateSticker("MEX2", "AM", { status: "F", quantity: 0 })).resolves.toMatchObject({ status: "F", quantity: 0 });
  await expect(updateSticker("MEX2", "AM", { status: "D", quantity: 1 })).resolves.toMatchObject({ status: "D", quantity: 1 });
  await expect(updateSticker("MEX2", "AM", { precio: 0 })).resolves.toMatchObject({ precio: 0 });
  await expect(updateSticker("MEX2", "AM", { precio: null })).resolves.toMatchObject({ precio: null });
});

test("rechaza cantidades inválidas antes de escribir y comunica el rechazo de una actualización parcial", async () => {
  for (const quantity of [-1, 1.5, NaN]) {
    await expect(updateSticker("MEX2", "CN", { quantity })).rejects.toThrow("entero no negativo");
  }
  await expect(updateSticker("MEX2", "CN", { status: "F", quantity: 1 })).rejects.toThrow("Estado inválido");
  expect(request).not.toHaveBeenCalled();

  request.mockResolvedValue(json({ code: "23514", message: "check constraint" }, 400));
  await expect(updateSticker("MEX2", "CN", { quantity: 1 })).rejects.toThrow("check constraint");
});
