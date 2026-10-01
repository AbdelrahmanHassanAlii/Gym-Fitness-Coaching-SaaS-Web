import type {
  LoginRequestDto,
  MfaLoginVerifyRequestDto,
  MfaRequiredResponseDto,
  SafeAuthUserDto,
} from "@/contracts";
import type { ApiClient, ApiError } from "@/lib/api";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

export interface InitializingAuthState {
  status: "initializing";
  accessToken: null;
  user: null;
  restrictedUntilVerified: false;
}

export interface AuthenticatedAuthState {
  status: "authenticated";
  accessToken: string;
  user: SafeAuthUserDto;
  restrictedUntilVerified: boolean;
}

export interface UnauthenticatedAuthState {
  status: "unauthenticated";
  accessToken: null;
  user: null;
  restrictedUntilVerified: false;
  lastError?: ApiError;
}

export type AuthState =
  InitializingAuthState | AuthenticatedAuthState | UnauthenticatedAuthState;

export type LoginCommand = Omit<LoginRequestDto, "clientType">;
export type MfaLoginCommand = MfaLoginVerifyRequestDto;

export type LoginCommandResult =
  | { status: "authenticated"; session: AuthenticatedAuthState }
  | { status: "mfa-required"; challenge: MfaRequiredResponseDto };

export type LogoutResult =
  { status: "server-confirmed" } | { status: "local-only"; error: ApiError };

export interface AuthSessionSnapshot {
  apiClient: ApiClient;
  generation: number;
  state: AuthState;
}

export interface AuthSessionContextValue extends AuthSessionSnapshot {
  bootstrap: () => Promise<AuthState>;
  getAccessToken: () => string | null;
  login: (command: LoginCommand) => Promise<LoginCommandResult>;
  logout: () => Promise<LogoutResult>;
  markSessionExpired: (error?: ApiError) => void;
  subscribe: (listener: () => void) => () => void;
  verifyMfaLogin: (command: MfaLoginCommand) => Promise<AuthenticatedAuthState>;
}
