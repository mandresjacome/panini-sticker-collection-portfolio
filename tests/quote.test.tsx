import { expect, test } from "vitest";
import { useQuote } from "../src/hooks/useQuote";
import { DEFAULT_CATEGORY_PRICES, type Sticker } from "../src/types";
import { click, mount } from "./support/react";

const basic: Sticker = { code: "MEX2", team: "MEX", type: "Selección", status: "D", quantity: 3 };
const override: Sticker = { ...basic, code: "MEX3", quantity: 1, precio: 0 };

function Quote({ stickers, basePrice = 1500 }: { stickers: Sticker[]; basePrice?: number }) {
  const quote = useQuote({ ...DEFAULT_CATEGORY_PRICES, BASICA: basePrice }, stickers);
  return (
    <>
      <button id="choose" onClick={() => quote.toggle(basic)}>Agregar</button>
      <button id="override" onClick={() => quote.toggle(override)}>Agregar con precio individual</button>
      <button id="clear" onClick={quote.clear}>Limpiar</button>
      <output id="qty">{quote.getQuantity(basic.code)}</output>
      <output id="selected">{String(quote.isSelected(basic.code))}</output>
      <output id="codes">{[...quote.selectedCodes].join(",")}</output>
      <output id="lines">{quote.quoteLines.map(({ qty, effectivePrice }) => `${qty}:${effectivePrice}`).join(",")}</output>
      <output id="total">{quote.total}</output>
      <output id="message">{quote.whatsappText}</output>
    </>
  );
}

test("ajusta unidades, selección y mensaje tras una baja de stock y al desaparecer la lámina", async () => {
  const { container, render } = await mount(<Quote stickers={[basic]} />);
  const read = (id: string) => container.querySelector(`#${id}`)?.textContent;
  for (let count = 0; count < 3; count++) await click(container.querySelector("#choose"));
  expect(read("qty")).toBe("3");
  expect(read("total")).toBe("4500");

  await render(<Quote stickers={[{ ...basic, quantity: 1 }]} />);
  expect(read("qty")).toBe("1");
  expect(read("selected")).toBe("true");
  expect(read("lines")).toBe("1:1500");
  expect(read("total")).toBe("1500");
  expect(read("message")).toContain("(1 lámina)");

  await render(<Quote stickers={[basic]} />);
  expect(read("qty")).toBe("1");
  await render(<Quote stickers={[]} />);
  expect(read("qty")).toBe("0");
  expect(read("selected")).toBe("false");
  expect(read("codes")).toBe("");
  expect(read("message")).toBe("");
  await render(<Quote stickers={[basic]} />);
  expect(read("qty")).toBe("0");
});

test.each([{ quantity: 0 }, { quantity: -2 }, { quantity: 1.5 }, { status: "F" as const }])(
  "rechaza stock no disponible aunque el clic lleve datos anteriores (%j)",
  async (fields) => {
    const { container, render } = await mount(<Quote stickers={[basic]} />);
    const add = container.querySelector<HTMLButtonElement>("#choose");
    await click(add);
    await render(<Quote stickers={[{ ...basic, ...fields }]} />);
    await click(add);
    expect(container.querySelector("#qty")?.textContent).toBe("0");
    expect(container.querySelector("#total")?.textContent).toBe("0");
  },
);

test("recalcula el precio de categoría y conserva el precio individual de cero", async () => {
  const stickers = [{ ...basic, quantity: 1, precio: null }, override];
  const { container, render } = await mount(<Quote stickers={stickers} />);
  await click(container.querySelector("#choose"));
  await click(container.querySelector("#override"));
  expect(container.querySelector("#lines")?.textContent).toBe("1:1500,1:0");
  await render(<Quote stickers={stickers} basePrice={3200} />);
  expect(container.querySelector("#total")?.textContent).toBe("3200");
  expect(container.querySelector("#lines")?.textContent).toBe("1:3200,1:0");
  await click(container.querySelector("#choose"));
  expect(container.querySelector("#codes")?.textContent).toBe(override.code);
  await click(container.querySelector("#clear"));
  expect(container.querySelector("#lines")?.textContent).toBe("");
});
