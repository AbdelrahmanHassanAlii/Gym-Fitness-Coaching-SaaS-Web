import "server-only";

import { cookies } from "next/headers";
import { localeCookieName, resolveLocale } from "./locales";

export async function getRequestLocale() {
  const cookieStore = await cookies();

  return resolveLocale(cookieStore.get(localeCookieName)?.value);
}
