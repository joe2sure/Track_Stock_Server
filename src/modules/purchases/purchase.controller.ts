import { Request, Response, NextFunction } from "express";
import { purchaseService } from "./purchase.service";
import respond from "../../shared/utils/response";

// ── Purchase Orders ──────────────────────────────────────────────────────────

export async function getPOs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const r = await purchaseService.getPOs(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, r.data, r.pagination, "Purchase orders retrieved");
  } catch (e) {
    next(e);
  }
}

export async function getPOById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.getPOById(
      req.params.id as string,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Purchase order retrieved",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function createPO(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.createPO(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Purchase order created",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function updatePO(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.updatePO(
      req.params.id as string,
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Purchase order updated",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function sendPO(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.sendPO(
      req.params.id as string,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Purchase order sent to supplier",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function approvePO(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.approvePO(
      req.params.id as string,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Purchase order approved",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function cancelPO(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.cancelPO(
      req.params.id as string,
      req.body.reason,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Purchase order cancelled",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function addPaymentToPO(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const po = await purchaseService.addPaymentToPO(
      req.params.id as string,
      req.body.payment,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Payment recorded",
      data: { purchaseOrder: po },
    });
  } catch (e) {
    next(e);
  }
}

export async function getPurchaseStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await purchaseService.getPurchaseStats(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Purchase stats", data: { stats } });
  } catch (e) {
    next(e);
  }
}

// ── GRNs ─────────────────────────────────────────────────────────────────────

export async function getGRNs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const r = await purchaseService.getGRNs(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, r.data, r.pagination, "GRNs retrieved");
  } catch (e) {
    next(e);
  }
}

export async function getGRNById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const grn = await purchaseService.getGRNById(
      req.params.id as string,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "GRN retrieved", data: { grn } });
  } catch (e) {
    next(e);
  }
}

export async function createGRN(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const grn = await purchaseService.createGRN(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Goods received and stock updated",
      data: { grn },
    });
  } catch (e) {
    next(e);
  }
}

// ── Purchase Returns ─────────────────────────────────────────────────────────

export async function getPurchaseReturns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const r = await purchaseService.getPurchaseReturns(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, r.data, r.pagination, "Purchase returns retrieved");
  } catch (e) {
    next(e);
  }
}

export async function createPurchaseReturn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ret = await purchaseService.createPurchaseReturn(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Purchase return created and stock adjusted",
      data: { purchaseReturn: ret },
    });
  } catch (e) {
    next(e);
  }
}

export async function recordCreditNote(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ret = await purchaseService.recordCreditNote(
      req.params.id as string,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Credit note recorded",
      data: { purchaseReturn: ret },
    });
  } catch (e) {
    next(e);
  }
}
