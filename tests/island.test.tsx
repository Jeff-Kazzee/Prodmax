import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "@island/app";

describe("island root", () => {
  it("renders the Prodmax wordmark on the home route", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Prodmax" }),
    ).toBeInTheDocument();
  });

  it("increments the counter when the button is clicked", () => {
    render(<App />);

    const button = screen.getByRole("button", { name: /hydration check/i });
    expect(button).toHaveTextContent("Hydration check: 0");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Hydration check: 1");
  });
});
