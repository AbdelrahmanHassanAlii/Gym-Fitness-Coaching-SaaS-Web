import type { ApiClient } from "@/lib/api";
import type { PlatformAuthority } from "@/lib/platform-access";
import { readCurrentContext } from "./api";
import { supportPermissions, type SupportContext } from "./contracts";

export type SupportAuthority = Pick<
  PlatformAuthority,
  | "principalId"
  | "sessionGeneration"
  | "membershipId"
  | "accessVersion"
  | "validUntil"
> & { permissions: readonly string[]; startValidUntil: string | null };
export function supportAuthority(
  authority: PlatformAuthority,
): SupportAuthority {
  return {
    principalId: authority.principalId,
    sessionGeneration: authority.sessionGeneration,
    membershipId: authority.membershipId,
    accessVersion: authority.accessVersion,
    validUntil: authority.validUntil,
    startValidUntil: authority.supportStartDecision?.validUntil ?? null,
    permissions: supportPermissions.filter((p) =>
      p === "support.sessions.start"
        ? authority.supportStartDecision?.allowed === true
        : authority.allows(p),
    ),
  };
}
export function authorityIdentity(a: SupportAuthority): string {
  return JSON.stringify([
    a.principalId,
    a.sessionGeneration,
    a.membershipId,
    a.accessVersion,
    a.validUntil,
    a.startValidUntil,
    [...a.permissions].sort(),
  ]);
}
export function runtimeAuthorityIdentity(a: SupportAuthority): string {
  return JSON.stringify([
    a.principalId,
    a.sessionGeneration,
    a.membershipId,
    a.accessVersion,
    a.startValidUntil,
    a.permissions.includes("support.sessions.start"),
  ]);
}
export function authorityLive(
  a: SupportAuthority,
  permission: string,
  now = Date.now(),
): boolean {
  const deadline =
    permission === "support.sessions.start" ? a.startValidUntil : a.validUntil;
  return (
    a.permissions.includes(permission) &&
    (deadline === null || Date.parse(deadline) > now)
  );
}
export interface RuntimeSnapshot {
  epoch: number;
  context: SupportContext | null;
  authority: SupportAuthority | null;
  pending: boolean;
  notice: "expired" | "lost" | "ended" | null;
}
const initial: RuntimeSnapshot = {
  epoch: 0,
  context: null,
  authority: null,
  pending: false,
  notice: null,
};
/** One instance per React root/tab. No query cache, storage, URL or native fallback. */
export class SupportRuntime {
  private snapshot: RuntimeSnapshot = initial;
  private listeners = new Set<() => void>();
  private flight: AbortController | null = null;
  private authIdentity: string | null = null;
  private selected: { id: string; workspaceId: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: RuntimeSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  bindAuth(identity: string | null) {
    if (this.authIdentity !== identity) {
      this.authIdentity = identity;
      this.retire("lost");
    }
  }
  retire(notice: RuntimeSnapshot["notice"] = "lost") {
    this.flight?.abort();
    this.flight = null;
    this.selected = null;
    clearTimeout(this.timer);
    this.publish({
      epoch: this.snapshot.epoch + 1,
      context: null,
      authority: null,
      pending: false,
      notice:
        this.snapshot.context || this.snapshot.pending
          ? notice
          : this.snapshot.notice,
    });
  }
  clearNotice() {
    this.publish({ ...this.snapshot, notice: null });
  }
  observeAuthority(authority: SupportAuthority | null) {
    if (!this.selected) return;
    const prior = this.snapshot.authority;
    if (
      !authority ||
      !prior ||
      runtimeAuthorityIdentity(prior) !== runtimeAuthorityIdentity(authority) ||
      !authorityLive(authority, "support.sessions.start")
    )
      this.retire("lost");
    else if (authorityIdentity(prior) !== authorityIdentity(authority)) {
      this.publish({ ...this.snapshot, authority });
      this.schedule();
    }
  }
  isSelected(id: string) {
    return this.selected?.id === id;
  }
  async select(
    api: ApiClient,
    id: string,
    workspaceId: string,
    authority: SupportAuthority,
  ): Promise<boolean> {
    this.retire();
    if (
      !this.authIdentity ||
      !authorityLive(authority, "support.sessions.start")
    )
      return false;
    this.selected = { id, workspaceId };
    this.publish({ ...this.snapshot, authority, pending: true, notice: null });
    this.schedule();
    return this.validate(api);
  }
  async validate(api: ApiClient): Promise<boolean> {
    const selected = this.selected,
      epoch = this.snapshot.epoch,
      authority = this.snapshot.authority;
    if (
      !selected ||
      !authority ||
      !authorityLive(authority, "support.sessions.start")
    ) {
      this.retire();
      return false;
    }
    if (
      this.snapshot.context &&
      Date.parse(this.snapshot.context.supportSession.expiresAt) <= Date.now()
    ) {
      this.retire("expired");
      return false;
    }
    this.flight?.abort();
    const flight = new AbortController();
    this.flight = flight;
    try {
      const context = await readCurrentContext(
        api,
        selected.id,
        selected.workspaceId,
        flight.signal,
      );
      if (
        this.snapshot.epoch !== epoch ||
        flight.signal.aborted ||
        !authorityLive(authority, "support.sessions.start")
      )
        return false;
      this.publish({ ...this.snapshot, context, pending: false, notice: null });
      this.schedule();
      return true;
    } catch {
      if (this.snapshot.epoch === epoch && !flight.signal.aborted)
        this.retire();
      return false;
    }
  }
  private schedule() {
    clearTimeout(this.timer);
    const authority = this.snapshot.authority;
    if (
      authority?.validUntil &&
      Date.parse(authority.validUntil) <= Date.now()
    ) {
      this.publish({
        ...this.snapshot,
        authority: {
          ...authority,
          validUntil: null,
          permissions: authority.permissions.filter(
            (p) => p === "support.sessions.start",
          ),
        },
      });
    }
    const deadlines = [
      this.snapshot.context?.supportSession.expiresAt,
      this.snapshot.authority?.startValidUntil,
      this.snapshot.authority?.validUntil,
    ]
      .filter((v): v is string => typeof v === "string")
      .map(Date.parse);
    if (!deadlines.length) return;
    const deadline = Math.min(...deadlines),
      remaining = deadline - Date.now();
    if (remaining <= 0) {
      this.retire(
        this.snapshot.context &&
          Date.parse(this.snapshot.context.supportSession.expiresAt) <=
            Date.now()
          ? "expired"
          : "lost",
      );
      return;
    }
    this.timer = setTimeout(
      () => this.schedule(),
      Math.min(remaining, 2_147_483_647),
    );
  }
  dispose() {
    this.retire();
    this.listeners.clear();
  }
}
