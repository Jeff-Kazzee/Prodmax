import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterBar } from "@island/features/issues/filter-bar";
import { decodeF, encodeF, isEmptyFilter } from "@island/features/issues/filter-ast";
import type { FilterNode } from "@/lib/validation/views";

function Harness() {
  const [params, setParams] = useSearchParams();
  const filter = decodeF(params.get("f"));
  const setFilter = (next: FilterNode) => {
    const nextParams = new URLSearchParams(params);
    if (isEmptyFilter(next)) nextParams.delete("f");
    else nextParams.set("f", encodeF(next));
    setParams(nextParams, { replace: true });
  };
  return (
    <div>
      <FilterBar filter={filter} count={3} onChange={setFilter} />
      <output data-testid="f-param">{params.get("f") ?? ""}</output>
    </div>
  );
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("filter chip CRUD + ?f= round-trip", () => {
  it("adds a chip and writes ?f=, then removes it", () => {
    render(
      <MemoryRouter initialEntries={["/issues"]}>
        <Routes>
          <Route path="/issues" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    const value = screen.getByLabelText("Filter value");
    fireEvent.change(value, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const encoded = screen.getByTestId("f-param").textContent ?? "";
    expect(encoded.length).toBeGreaterThan(0);
    expect(decodeF(encoded)).toMatchObject({
      combinator: "and",
      children: [{ field: "priority", op: "eq", value: 4 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Priority filter" }));
    expect(screen.getByTestId("f-param")).toHaveTextContent("");
  });

  it("restores chips from a pasted ?f=", () => {
    const f = encodeF({
      combinator: "and",
      children: [{ field: "priority", op: "eq", value: 3 }],
    });
    render(
      <MemoryRouter initialEntries={[`/issues?f=${encodeURIComponent(f)}`]}>
        <Routes>
          <Route path="/issues" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
  });
});
