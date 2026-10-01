import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Home from "./page";

describe("public home page", () => {
  test("renders the current web foundation message", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Hassan Gym & Fitness Coaching SaaS",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Web foundation")).toBeInTheDocument();
  });
});
