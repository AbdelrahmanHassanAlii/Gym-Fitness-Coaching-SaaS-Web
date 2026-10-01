import type { UserId } from "@/contracts/common/ids";

export const authClientTypes = ["WEB", "IOS", "ANDROID"] as const;
export type AuthClientType = (typeof authClientTypes)[number];

export const webRefreshCookieName = "__Secure-gym_refresh";
export const webRefreshCookiePath = "/api/v1/auth";

export interface SafeAuthUserDto {
  id: UserId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface AuthTokenResponseDto {
  accessToken: string;
  refreshToken?: string;
  user: SafeAuthUserDto;
  restrictedUntilVerified: boolean;
}

export interface MfaRequiredResponseDto {
  status: "MFA_REQUIRED";
  mfaChallengeToken: string;
  availableMethods: Array<"TOTP" | "RECOVERY_CODE">;
}

export type LoginResponseDto = AuthTokenResponseDto | MfaRequiredResponseDto;

const authClientTypeSet = new Set<string>(authClientTypes);

export function isAuthClientType(
  value: string | null | undefined,
): value is AuthClientType {
  return typeof value === "string" && authClientTypeSet.has(value);
}
