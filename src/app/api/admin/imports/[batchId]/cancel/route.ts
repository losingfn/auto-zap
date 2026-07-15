import { getCurrentAdminSession } from "@/features/admin/auth";
import {
  buildCancelImportEndpointDependencies,
  handleCancelImportRequest
} from "@/features/admin/import-cancel-endpoint";

type CancelImportRouteContext = {
  params: Promise<{ batchId: string }>;
};

export async function POST(request: Request, context: CancelImportRouteContext) {
  const params = await context.params;

  return handleCancelImportRequest(
    request,
    params,
    buildCancelImportEndpointDependencies(getCurrentAdminSession)
  );
}
