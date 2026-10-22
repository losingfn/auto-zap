import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivacyConfiguration } from "@/config/privacy";
import { siteConfig } from "@/config/site";
import {
  MAX_PRIVACY_PROOFS, PRIVACY_API_PATH, PRIVACY_COOKIE, PRIVACY_PROOF_PREFIX, PrivacyOperationConflict, unknownConsent,
  type ConsentAcknowledgement, type ConsentEventKind, type RegisteredConsent
} from "./domain";
import { createPrivacyReceipt, findPrivacyReceipt, privacyReceiptFailure, privacyReceipts, proofCookieName } from "./receipt";

type Repository = {
  getRegisteredConsent: (id: string) => Promise<RegisteredConsent>;
  registerConsentEvent: (input: {
    receiptId: string; operationId: string; kind: ConsentEventKind; documentVersion: string | null; receiptExpiresAt: number;
  }) => Promise<ConsentAcknowledgement>;
};
const idSchema = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare") }).strict(),
  z.object({ action: z.enum(["grant", "decline", "revoke"]), operationId: z.string().uuid(),
    receiptId: idSchema, documentVersion: z.string().max(120).nullable() }).strict()
]);
function respond(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie, X-Privacy-Receipt", ...(status === 429 ? { "Retry-After": "60" } : {})
  } });
}
const cookieOptions = (expiresAt: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const,
  path: PRIVACY_API_PATH, expires: new Date(expiresAt)
});

/** Injection is only for isolated tests; the route supplies the real PostgreSQL repository. */
export function createPrivacyConsentHandlers(repository: Repository) {
  const limits = new Map<string, { count: number; until: number }>();
  function limited(key: string, maximum: number) {
    const now = Date.now();
    for (const [name, value] of limits) if (value.until <= now) limits.delete(name);
    const bucket = limits.get(key) ?? { count: 0, until: now + 60_000 };
    if (bucket.count >= maximum) return true;
    bucket.count++; limits.set(key, bucket); return false;
  }
  return {
    async GET(request: NextRequest) {
      try {
        const selected = request.headers.get("X-Privacy-Receipt");
        if (selected !== null && !idSchema.safeParse(selected).success) return respond({ error: "Некорректный запрос." }, 400);
        const proofs = selected ? [findPrivacyReceipt(request.cookies, selected)].filter((value) => value !== null)
          : privacyReceipts(request.cookies);
        if (selected && !proofs.length) return respond({ error: "Не удалось подтвердить настройки. Повторите действие.", code: privacyReceiptFailure(request.cookies, selected) }, 409);
        if (!proofs.length) return respond({ ...unknownConsent, receipts: [] });
        if (proofs.length > MAX_PRIVACY_PROOFS) return respond({ error: "Попробуйте чуть позже.", code: "receipt_limit" }, 409);
        if (limited("status", 240)) return respond({ error: "Попробуйте чуть позже." }, 429);
        const receipts: RegisteredConsent[] = [];
        for (const proof of proofs) {
          if (limited(`status:${proof.receiptId}`, 30)) return respond({ error: "Попробуйте чуть позже." }, 429);
          receipts.push(await repository.getRegisteredConsent(proof.receiptId));
        }
        const current = receipts.find((receipt) => receipt.state === "granted") ?? receipts[0];
        return respond({ ...current, receipts });
      } catch { return respond({ error: "Не удалось проверить настройки. Аналитика отключена.", code: "unavailable" }, 503); }
    },
    async POST(request: NextRequest) {
      const allowedOrigin = new URL(process.env.APP_URL || siteConfig.url).origin;
      if (request.headers.get("origin") !== allowedOrigin ||
        (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
        return respond({ error: "Недопустимый запрос." }, 403);
      }
      if (!request.headers.get("content-type")?.startsWith("application/json")) return respond({ error: "Некорректный запрос." }, 415);
      try {
        const reader = request.body?.getReader();
        if (!reader) return respond({ error: "Некорректный запрос." }, 400);
        const chunks: Uint8Array[] = []; let bytes = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > 2048) { await reader.cancel(); return respond({ error: "Слишком большой запрос." }, 413); }
          chunks.push(value);
        }
        const parsed = inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (!parsed.success) return respond({ error: "Некорректный запрос." }, 400);
        const input = parsed.data;
        if (input.action === "prepare") {
          if (limited("prepare", 120)) return respond({ error: "Попробуйте чуть позже." }, 429);
          const proofs = privacyReceipts(request.cookies);
          const removed: string[] = [];
          // Never evict a live or unconfirmed proof to make room. Client mutations are serialized across tabs.
          if (proofs.length >= MAX_PRIVACY_PROOFS) {
            for (const proof of proofs) {
              const state = await repository.getRegisteredConsent(proof.receiptId);
              if (["declined", "revoked", "expired"].includes(state.state)) removed.push(proof.receiptId);
            }
          }
          const retained = proofs.filter((proof) => !removed.includes(proof.receiptId));
          if (retained.length >= MAX_PRIVACY_PROOFS) return respond({ error: "Попробуйте чуть позже.", code: "receipt_limit" }, 409);
          const receipt = createPrivacyReceipt();
          const response = respond({ receiptId: receipt.receiptId, expiresAt: receipt.expiresAt });
          response.cookies.set(PRIVACY_COOKIE, receipt.value, cookieOptions(receipt.expiresAt));
          const validNames = new Set(proofs.map((proof) => proofCookieName(proof.receiptId)));
          for (const cookie of request.cookies.getAll()) {
            if (cookie.name.startsWith(PRIVACY_PROOF_PREFIX) && /^[a-f0-9]{64}$/.test(cookie.name.slice(PRIVACY_PROOF_PREFIX.length)) &&
              !validNames.has(cookie.name)) response.cookies.set(cookie.name, "", { ...cookieOptions(0), maxAge: 0 });
          }
          for (const id of removed) response.cookies.set(proofCookieName(id), "", { ...cookieOptions(0), maxAge: 0 });
          // Preserve legacy credentials before replacing the current pointer; signatures never enter localStorage.
          for (const proof of retained) response.cookies.set(proofCookieName(proof.receiptId), proof.value, cookieOptions(proof.expiresAt));
          response.cookies.set(proofCookieName(receipt.receiptId), receipt.value, cookieOptions(receipt.expiresAt));
          return response;
        }
        const configuration = getPrivacyConfiguration();
        if (input.action === "grant" && (!configuration.analyticsReady ||
          !configuration.document || input.documentVersion !== configuration.document.version)) {
          return respond({ error: "Принятие согласия пока недоступно. Аналитика отключена.", code: "analytics_unavailable" }, 409);
        }
        const receipt = findPrivacyReceipt(request.cookies, input.receiptId);
        if (!receipt) return respond({ error: "Не удалось подтвердить настройки. Повторите действие.", code: privacyReceiptFailure(request.cookies, input.receiptId) }, 409);
        const lane = input.action === "grant" ? "grant" : "withdraw";
        if (limited(lane, 120) || limited(`${lane}:${receipt.receiptId}`, 20)) return respond({ error: "Попробуйте чуть позже." }, 429);
        const registered = await repository.registerConsentEvent({
          receiptId: receipt.receiptId, operationId: input.operationId, kind: input.action,
          documentVersion: input.documentVersion, receiptExpiresAt: receipt.expiresAt
        });
        return respond(registered);
      } catch (error) {
        if (error instanceof SyntaxError) return respond({ error: "Некорректный запрос." }, 400);
        if (error instanceof PrivacyOperationConflict) return respond({ error: "Не удалось подтвердить настройки. Повторите действие.", code: "operation_conflict" }, 409);
        return respond({ error: "Не удалось сохранить настройки. Повторите попытку.", code: "unavailable" }, 503);
      }
    }
  };
}
