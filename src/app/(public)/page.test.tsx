import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@/theme/ThemeProvider";
import Home from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
    }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("public home page", () => {
  test("renders the current web foundation message", async () => {
    render(
      <ThemeProvider>
        {await Home()}
      </ThemeProvider>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Hassan Gym & Fitness Coaching SaaS",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Web foundation")).toBeInTheDocument();
  });
});
