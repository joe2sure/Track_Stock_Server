import { Request, Response, NextFunction } from "express";
import { saleService } from "./sale.service";
import respond from "../../shared/utils/response";

// ── Sales ─────────────────────────────────────────────────────────────────────
export async function getSales(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const r = await saleService.getSales(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, r.data, r.pagination, "Sales retrieved");
  } catch (e) {
    next(e);
  }
}

export async function getSaleById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await saleService.getSaleById(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Sale retrieved", data: { sale } });
  } catch (e) {
    next(e);
  }
}

export async function getSaleByOrderNumber(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await saleService.getSaleByOrderNumber(
      req.params.orderNumber,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Sale retrieved", data: { sale } });
  } catch (e) {
    next(e);
  }
}

export async function createSale(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await saleService.createSale(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Sale created successfully",
      data: { sale },
    });
  } catch (e) {
    next(e);
  }
}

export async function addPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await saleService.addPayment(
      req.params.id,
      req.body.payment,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "Payment recorded", data: { sale } });
  } catch (e) {
    next(e);
  }
}

export async function cancelSale(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await saleService.cancelSale(
      req.params.id,
      req.body.reason,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "Sale cancelled", data: { sale } });
  } catch (e) {
    next(e);
  }
}

export async function processReturn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await saleService.processReturn(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, { message: "Return processed", data: { sale } });
  } catch (e) {
    next(e);
  }
}

export async function getDailyClosing(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await saleService.getDailyClosing(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Daily closing report generated",
      data: { report },
    });
  } catch (e) {
    next(e);
  }
}

export async function getSalesStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await saleService.getSalesStats(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Sales stats retrieved", data: { stats } });
  } catch (e) {
    next(e);
  }
}

// ── Customers ─────────────────────────────────────────────────────────────────
export async function getCustomers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const r = await saleService.getCustomers(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, r.data, r.pagination, "Customers retrieved");
  } catch (e) {
    next(e);
  }
}

export async function getCustomerById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await saleService.getCustomerById(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Customer retrieved", data: { customer } });
  } catch (e) {
    next(e);
  }
}

export async function createCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await saleService.createCustomer(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, { message: "Customer created", data: { customer } });
  } catch (e) {
    next(e);
  }
}

export async function updateCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await saleService.updateCustomer(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Customer updated", data: { customer } });
  } catch (e) {
    next(e);
  }
}

export async function getCustomerSales(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const limit = parseInt(String(req.query.limit ?? "20"), 10);
    const sales = await saleService.getCustomerSales(
      req.params.id,
      req.user?.tenantId ?? "default",
      limit,
    );
    respond.success(res, { message: "Customer sales", data: { sales } });
  } catch (e) {
    next(e);
  }
}

export async function adjustCustomerCredit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await saleService.adjustCustomerCredit(
      req.params.id,
      req.body.amount,
      req.body.notes,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Credit adjusted", data: { customer } });
  } catch (e) {
    next(e);
  }
}
