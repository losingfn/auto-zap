import {
  PRIVACY_STORAGE_KEY, hasRegisteredGrant, parsePrivacyChoice, twelveMonthsAfter, unknownConsent,
  type ConsentAcknowledgement, type ConsentEventKind, type ConsentStatus, type PrivacyChoice, type RegisteredConsent
} from "./domain";

export const PRIVACY_INTENT_KEY = "autozap.privacy-intent.v2";
export const PRIVACY_OPERATION_PREFIX = "autozap.privacy-operation.v2.";
export const PRIVACY_LOCK = "autozap.privacy-mutations.v2";
const SAVE_ERROR = "Не удалось сохранить настройки. Попробуйте ещё раз.";
const uuid = /^[a-f0-9-]{36}$/i;
const receiptId = /^[a-f0-9]{64}$/;
type Intent = { id: string; grant: boolean };
export type PendingConsentOperation = {
  id: string; receiptId: string; action: ConsentEventKind; documentVersion: string | null; expiresAt: number; blocked?: boolean;
};
export type PrivacySnapshot = {
  choice: PrivacyChoice | null; registered: RegisteredConsent; hydrated: boolean; busy: boolean; message: string;
};
export type PrivacyPlatform = {
  storage: Storage; now: () => number; id: () => string; stop: () => void;
  request: <T>(body?: unknown, receiptId?: string) => Promise<T>;
  lock?: <T>(work: () => Promise<T>) => Promise<T>;
  changed: (snapshot: PrivacySnapshot) => void;
};
export class PrivacyRequestError extends Error {
  constructor(public status: number, public code = "") { super("Privacy request failed"); }
  get terminal() { return [400, 401, 403, 409, 413, 415].includes(this.status); }
}

/** One shared intent, durable per-receipt operations and a Web Lock; no signatures in web storage. */
export class PrivacyCoordinator {
  snapshot: PrivacySnapshot = { choice: null, registered: unknownConsent, hydrated: false, busy: false, message: "" };
  private epoch = 0;
  private attempts = 0;
  private storageAvailable = true;
  private alive = true;
  constructor(private platform: PrivacyPlatform, private version: string | null, private ready: boolean) {}
  dispose() { this.alive = false; this.epoch++; this.platform.stop(); }
  private emit(patch: Partial<PrivacySnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    if (this.alive) this.platform.changed(this.snapshot);
  }
  clearMessage() { this.emit({ message: "" }); }
  private readChoice() { return parsePrivacyChoice(this.platform.storage.getItem(PRIVACY_STORAGE_KEY), this.platform.now()); }
  private intent(): Intent | null {
    const raw = this.platform.storage.getItem(PRIVACY_INTENT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !uuid.test(value.id) || typeof value.grant !== "boolean") throw new Error("Invalid privacy intent");
    return value;
  }
  private operations() {
    const result: PendingConsentOperation[] = [];
    for (let i = 0; i < this.platform.storage.length; i++) {
      const key = this.platform.storage.key(i);
      if (!key?.startsWith(PRIVACY_OPERATION_PREFIX)) continue;
      const value: PendingConsentOperation = JSON.parse(this.platform.storage.getItem(key)!);
      if (!value || !uuid.test(value.id) || !receiptId.test(value.receiptId) ||
        !["grant", "decline", "revoke"].includes(value.action) || !Number.isFinite(value.expiresAt) ||
        !(value.documentVersion === null || typeof value.documentVersion === "string") ||
        key !== this.operationKey(value) || (value.blocked !== undefined && typeof value.blocked !== "boolean")) {
        throw new Error("Invalid privacy operation");
      }
      result.push(value);
    }
    if (result.length > 16) throw new Error("Too many privacy operations");
    return result;
  }
  private operationKey(operation: Pick<PendingConsentOperation, "receiptId" | "action">) {
    return `${PRIVACY_OPERATION_PREFIX}${operation.receiptId}.${operation.action === "grant" ? "grant" : "withdraw"}`;
  }
  private storeOperation(operation: PendingConsentOperation) {
    this.platform.storage.setItem(this.operationKey(operation), JSON.stringify(operation));
  }
  private removeOperation(operation: PendingConsentOperation) { this.platform.storage.removeItem(this.operationKey(operation)); }
  private withdraw(id: string, expiresAt: number, action: "decline" | "revoke", operationId?: string) {
    const previous = this.operations().find((operation) => operation.receiptId === id && operation.action !== "grant");
    if (previous) return previous;
    const operation: PendingConsentOperation = {
      id: operationId ?? this.platform.id(), receiptId: id, action, documentVersion: null, expiresAt
    };
    this.storeOperation(operation); return operation;
  }
  private persist(choice: PrivacyChoice) {
    this.platform.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(choice));
    this.emit({ choice });
  }
  hasPending() {
    try { return Boolean(this.readChoice()?.pending || this.operations().length); }
    catch { return true; }
  }
  isAuthorized() {
    try {
      const local = this.readChoice(); const intent = this.intent();
      return this.alive && this.storageAvailable && this.ready && !this.operations().length &&
        (!intent || intent.grant && intent.id === local?.intentId) &&
        hasRegisteredGrant(local, this.snapshot.registered, this.version, this.platform.now());
    } catch { return false; }
  }
  suspend() { this.epoch++; this.platform.stop(); this.emit({ registered: unknownConsent }); }

  async synchronize() {
    const epoch = ++this.epoch; this.platform.stop();
    this.emit({ registered: unknownConsent });
    try {
      const stored = this.platform.storage.getItem(PRIVACY_STORAGE_KEY);
      const local = parsePrivacyChoice(stored, this.platform.now()); this.storageAvailable = true;
      // Retain the identity even when verification fails. A failed GET is not a new visitor.
      this.emit({ choice: local, hydrated: true });
      // Pending choices are migrated under the mutation lock in save(). A storage listener
      // must not recreate an operation between another tab's acknowledgement and final persist.
      if (!local || local.decision !== "granted") return;
      const server = await this.platform.request<ConsentStatus>(undefined, local.receiptId!);
      if (epoch !== this.epoch || this.platform.storage.getItem(PRIVACY_STORAGE_KEY) !== stored) return;
      if (hasRegisteredGrant(local, server, this.version, this.platform.now())) this.emit({ registered: server });
    } catch { if (epoch === this.epoch) this.emit({ hydrated: true, registered: unknownConsent }); }
  }

  private async execute(operation: PendingConsentOperation): Promise<RegisteredConsent> {
    if (operation.blocked) throw new PrivacyRequestError(409, "blocked");
    try {
      if (operation.expiresAt <= this.platform.now()) throw new PrivacyRequestError(409, "expired");
      const server = await this.platform.request<ConsentAcknowledgement>({
        action: operation.action, receiptId: operation.receiptId, operationId: operation.id,
        documentVersion: operation.documentVersion
      });
      const grant = operation.action === "grant";
      if (server.receiptId !== operation.receiptId || server.operationId !== operation.id ||
        (grant ? server.eventKind !== "grant" || server.state !== "granted" ||
          server.documentVersion !== operation.documentVersion || !server.expiresAt || server.expiresAt <= this.platform.now()
          : operation.action === "revoke" ? server.eventKind !== "revoke" || server.state !== "revoked"
            : !["decline", "revoke"].includes(server.eventKind) || !["declined", "revoked"].includes(server.state))) {
        throw new PrivacyRequestError(409, "invalid_acknowledgement");
      }
      return server;
    } catch (error) {
      if (operation.action !== "grant" && error instanceof PrivacyRequestError &&
        error.status === 409 && error.code === "operation_conflict") {
        // Another operation may already have delivered this withdrawal. Verify the same
        // authenticated receipt; do not fabricate an acknowledgement for a new UUID.
        const existing = await this.platform.request<ConsentStatus>(undefined, operation.receiptId);
        if (existing.receiptId === operation.receiptId && (operation.action === "revoke"
          ? existing.state === "revoked" : ["declined", "revoked"].includes(existing.state))) return existing;
      }
      if (error instanceof PrivacyRequestError && error.terminal) this.storeOperation({ ...operation, blocked: true });
      throw error;
    }
  }

  /** Called under the cross-tab lock. Abandoned grants are withdrawn, never granted in the background. */
  private async flushWithdrawals() {
    // Retire both expired local lanes together, including terminal failures. Keep
    // the newer negative intent; this is NOT a server withdrawal ACK. Server-side
    // expiry is rechecked under its receipt lock before any insertion or cleanup.
    for (const operation of this.operations()) {
      if (operation.expiresAt > this.platform.now()) continue;
      this.platform.storage.removeItem(this.operationKey({ ...operation, action: "grant" }));
      this.platform.storage.removeItem(this.operationKey({ ...operation, action: "revoke" }));
      const local = this.readChoice();
      if (local?.decision === "declined" && local.pending && local.receiptId === operation.receiptId) {
        // The off choice may outlive the old proof. Do not recreate that receipt's
        // operation with the off choice's newer expiry on the next visit.
        this.persist({ ...local, receiptId: null, documentVersion: null,
          pending: "decline", operationId: this.platform.id() });
      }
    }
    const raw = this.platform.storage.getItem(PRIVACY_STORAGE_KEY);
    if (raw) {
      const expired = JSON.parse(raw);
      if (Number.isFinite(expired.expiresAt) && expired.expiresAt <= this.platform.now()) {
        this.platform.storage.removeItem(PRIVACY_STORAGE_KEY);
        this.emit({ choice: null, registered: unknownConsent });
      }
    }
    for (const operation of this.operations()) {
      if (operation.action === "grant") this.withdraw(operation.receiptId, operation.expiresAt, "revoke");
    }
    let result: RegisteredConsent | null = null;
    for (const operation of this.operations().filter((operation) => operation.action !== "grant")) {
      result = await this.execute(operation);
      this.removeOperation(operation);
      this.platform.storage.removeItem(this.operationKey({ receiptId: operation.receiptId, action: "grant" }));
    }
    return result;
  }

  private async cancelSupersededGrant(operation: PendingConsentOperation) {
    this.withdraw(operation.receiptId, operation.expiresAt, "revoke");
    const server = await this.flushWithdrawals();
    const intent = this.intent(), choice = this.readChoice();
    // Another process can publish off between our intent check and localStorage.setItem.
    if (server && intent && !intent.grant && choice?.decision === "granted" && choice.receiptId === operation.receiptId) {
      this.persist({ version: 1, decision: "declined", receiptId: server.receiptId,
        expiresAt: twelveMonthsAfter(this.platform.now()), documentVersion: null, intentId: intent.id });
    }
  }

  async save(grant: boolean, automatic = false): Promise<boolean> {
    if (this.snapshot.busy || !this.alive || automatic && this.attempts >= 3) return false;
    if (grant && !this.ready) return false;
    if (automatic) this.attempts++; else this.attempts = 0;
    ++this.epoch; this.platform.stop();
    this.emit({ busy: true, registered: unknownConsent, message: "" });
    let intent: Intent | null = null;
    try {
      const previous = this.readChoice() ?? this.snapshot.choice;
      if (!automatic) {
        intent = { id: this.platform.id(), grant };
        this.platform.storage.setItem(PRIVACY_INTENT_KEY, JSON.stringify(intent));
        if (!grant) {
          // Publish off immediately, before waiting for another tab's network operation.
          const pending = previous?.receiptId ? this.withdraw(previous.receiptId, previous.expiresAt,
            previous.pending ?? (previous.decision === "granted" ? "revoke" : "decline"), previous.operationId) : null;
          this.persist({ version: 1, decision: "declined", receiptId: previous?.receiptId ?? null,
            expiresAt: twelveMonthsAfter(this.platform.now()), documentVersion: previous?.documentVersion ?? null,
            pending: previous?.pending ?? (previous?.decision === "granted" ? "revoke" : "decline"),
            operationId: pending?.id ?? previous?.operationId ?? this.platform.id(), intentId: intent.id });
        }
      } else intent = this.intent();
      // A browser without Web Locks may deliver idempotent withdrawals, but cannot issue new grants.
      if (grant && !this.platform.lock) throw new Error("Privacy coordination unavailable");
      const lock = this.platform.lock ?? (async <T>(work: () => Promise<T>) => work());
      return await lock(async () => {
        if (!this.alive) return false;
        if (automatic && !this.hasPending()) return false;
        let current = this.readChoice();
        if (current?.pending && current.receiptId) this.withdraw(current.receiptId, current.expiresAt, current.pending, current.operationId);
        let server: RegisteredConsent | null = await this.flushWithdrawals();
        current = this.readChoice();
        if (grant) {
          if (intent?.id !== this.intent()?.id) return false;
          // A new explicit grant may replace an old document/version only after its grant is withdrawn.
          const status = await this.platform.request<ConsentStatus>();
          for (const receipt of status.receipts ?? [status]) {
            if (receipt.receiptId && receipt.state === "granted") {
              this.withdraw(receipt.receiptId, receipt.expiresAt ?? this.platform.now(), "revoke");
            }
          }
          await this.flushWithdrawals();
          if (intent?.id !== this.intent()?.id) return false;
          const prepared = await this.platform.request<{ receiptId: string; expiresAt: number }>({ action: "prepare" });
          if (!receiptId.test(prepared.receiptId) || !Number.isFinite(prepared.expiresAt)) throw new Error("Invalid preparation");
          if (intent?.id !== this.intent()?.id) return false;
          const operation: PendingConsentOperation = { id: this.platform.id(), receiptId: prepared.receiptId,
            expiresAt: prepared.expiresAt, action: "grant", documentVersion: this.version };
          this.storeOperation(operation); // Durable before POST; a closed tab leaves enough identity for withdrawal.
          server = await this.execute(operation);
          if (intent?.id !== this.intent()?.id) {
            await this.cancelSupersededGrant(operation); return false;
          }
          this.persist({ version: 1, decision: "granted", receiptId: operation.receiptId,
            expiresAt: server.expiresAt!, documentVersion: this.version, intentId: intent!.id });
          this.removeOperation(operation);
          // Another tab can publish off outside the lock; never authorize from an earlier response.
          if (intent?.id !== this.intent()?.id) {
            await this.cancelSupersededGrant(operation); return false;
          }
        } else {
          // Discover all authenticated grants even after lost/corrupt localStorage. A GET error cannot become decline B.
          const status = await this.platform.request<ConsentStatus>();
          for (const receipt of status.receipts ?? [status]) {
            if (receipt.receiptId && receipt.state === "granted") {
              this.withdraw(receipt.receiptId, receipt.expiresAt ?? this.platform.now(), "revoke");
            }
          }
          server = await this.flushWithdrawals() ?? server;
          if (!server && current?.receiptId) {
            // A preceding lock holder may already have delivered this exact withdrawal.
            server = (status.receipts ?? [status]).find((receipt) => receipt.receiptId === current.receiptId &&
              (current.decision === "granted" || current.pending === "revoke" ? receipt.state === "revoked"
                : ["declined", "revoked"].includes(receipt.state))) ?? null;
          }
          if (!server && !current?.receiptId) {
            const candidate = (status.receipts ?? [status]).find((receipt) => receipt.receiptId);
            const prepared = candidate?.receiptId ? { receiptId: candidate.receiptId,
              expiresAt: candidate.expiresAt ?? twelveMonthsAfter(this.platform.now()) }
              : await this.platform.request<{ receiptId: string; expiresAt: number }>({ action: "prepare" });
            const operation = this.withdraw(prepared.receiptId, prepared.expiresAt, "decline", current?.operationId);
            server = await this.execute(operation); this.removeOperation(operation);
          }
          if (!server || this.operations().length) throw new Error("Withdrawal is unconfirmed");
          if (intent?.id !== this.intent()?.id) return false;
          this.persist({ version: 1, decision: "declined", receiptId: server.receiptId,
            expiresAt: twelveMonthsAfter(this.platform.now()), documentVersion: null, intentId: intent?.id });
        }
        this.emit({ registered: server!, message: "" });
        return !automatic && this.alive && intent?.id === this.intent()?.id;
      });
    } catch {
      this.emit({ registered: unknownConsent, message: automatic ? this.snapshot.message : SAVE_ERROR });
      return false;
    } finally { this.emit({ busy: false }); }
  }
  async retry(reset = false) {
    if (reset) this.attempts = 0;
    if (this.hasPending()) await this.save(false, true);
  }
}
