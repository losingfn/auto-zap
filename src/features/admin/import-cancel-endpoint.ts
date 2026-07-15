import {
  AdminImportError,
  cancelAdminImportBatch
} from "@/features/admin/imports";
import type { CurrentAdminSession } from "./auth";

export type CancelImportEndpointSession = Pick<CurrentAdminSession, "user"> | null;

export interface CancelImportEndpointDependencies {
  getSession(): Promise<CancelImportEndpointSession>;
  cancelImportBatch(input: { importBatchId: string; adminUserId: string }): Promise<void>;
  logger?: Pick<Console, "error">;
}

export interface CancelImportRouteParams {
  batchId?: string;
}

const DEFAULT_CANCEL_IMPORT_DEPENDENCIES: Pick<
  CancelImportEndpointDependencies,
  "cancelImportBatch" | "logger"
> = {
  cancelImportBatch: cancelAdminImportBatch,
  logger: console
};

export async function handleCancelImportRequest(
  request: Request,
  params: CancelImportRouteParams,
  dependencies: CancelImportEndpointDependencies
) {
  const session = await dependencies.getSession();
  if (!session) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Требуется вход в админку."
        }
      },
      401
    );
  }

  if (!isSameOriginAdminMutation(request)) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "Запрос отмены должен быть отправлен из админки сайта."
        }
      },
      403
    );
  }

  const batchId = params.batchId?.trim();
  if (!batchId) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "missing_batch_id",
          message: "Не указан импорт для отмены."
        }
      },
      400
    );
  }

  try {
    await dependencies.cancelImportBatch({
      importBatchId: batchId,
      adminUserId: session.user.id
    });

    return jsonResponse({
      ok: true,
      status: "cancelled",
      redirectTo: buildImportCancelledRedirect(batchId)
    });
  } catch (error) {
    dependencies.logger?.error("[admin/import] cancel_endpoint_failed", {
      importBatchId: batchId,
      adminUserId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    const adminError = error instanceof AdminImportError ? error : null;
    return jsonResponse(
      {
        ok: false,
        error: {
          code: adminError?.code ?? "cancel_failed",
          message:
            adminError?.message ??
            (error instanceof Error ? error.message : "Не удалось отменить импорт.")
        }
      },
      adminError?.code === "not_found" ? 404 : 400
    );
  }
}

export function buildCancelImportEndpointDependencies(
  getSession: CancelImportEndpointDependencies["getSession"]
): CancelImportEndpointDependencies {
  return {
    ...DEFAULT_CANCEL_IMPORT_DEPENDENCIES,
    getSession
  };
}

export function buildImportCancelledRedirect(batchId: string) {
  return `/admin/import?batch=${encodeURIComponent(batchId)}&cancelled=1`;
}

export function isSameOriginAdminMutation(request: Request) {
  const sourceOrigin = getSourceOrigin(request);
  if (!sourceOrigin) {
    return false;
  }

  return getAllowedRequestOrigins(request).has(sourceOrigin);
}

function getSourceOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    return normalizeOrigin(origin);
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  return normalizeOrigin(referer);
}

function getAllowedRequestOrigins(request: Request) {
  const origins = new Set<string>();
  const requestUrl = new URL(request.url);
  origins.add(requestUrl.origin);

  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host");
  const proto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    requestUrl.protocol.replace(/:$/, "");

  if (host) {
    origins.add(`${proto}://${host}`);
  }

  return origins;
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}
