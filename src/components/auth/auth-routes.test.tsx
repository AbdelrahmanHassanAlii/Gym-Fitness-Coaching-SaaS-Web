import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { AuthGate } from "./AuthGate";
import type { AuthState } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  authSession: {
    bootstrap: vi.fn(async () => ({
      accessToken: null,
      restrictedUntilVerified: false,
      status: "unauthenticated",
      user: null,
    })),
    login: vi.fn(),
    state: {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "initializing",
      user: null,
    } as AuthState,
    verifyMfaLogin: vi.fn(),
  },
  replace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

const labels = {
  credentialLabel: "Email or phone",
  errorFallback: "Try again",
  loading: "Continuing...",
  mfaCredentialLabel: "Verification code",
  mfaHelp: "Complete verification.",
  mfaMethodLabel: "Verification method",
  mfaSubmit: "Verify",
  passwordLabel: "Password",
  submit: "Sign in",
  title: "Sign in",
};

describe("auth route behavior", () => {
  beforeEach(() => {
    mocks.replace.mockClear();
    mocks.authSession.bootstrap.mockClear();
    mocks.authSession.login.mockClear();
    mocks.authSession.verifyMfaLogin.mockClear();
    mocks.authSession.state = {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "initializing",
      user: null,
    } as AuthState;
  });

  test("does not render protected content while auth is unresolved", () => {
    render(
      <AuthGate loadingLabel="Checking session">
        <h1>Protected content</h1>
      </AuthGate>,
    );

    expect(screen.getByText("Checking session")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  test("redirects unauthenticated protected routes without rendering children", () => {
    mocks.authSession.state = {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "unauthenticated",
      user: null,
    } as AuthState;

    render(
      <AuthGate loadingLabel="Checking session">
        <h1>Protected content</h1>
      </AuthGate>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Fapp");
  });

  test("renders protected content only after authentication", () => {
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "A",
        id: "user_a",
        lastName: "User",
        phoneVerified: false,
      },
    } as AuthState;

    render(
      <AuthGate loadingLabel="Checking session">
        <h1>Protected content</h1>
      </AuthGate>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  test("authenticated login route shows loading while redirecting instead of the form", () => {
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "A",
        id: "user_a",
        lastName: "User",
        phoneVerified: false,
      },
    } as AuthState;

    render(<LoginForm labels={labels} />);

    expect(screen.getByText("Continuing...")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith("/app");
  });
});
