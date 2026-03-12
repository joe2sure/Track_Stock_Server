import { Request, Response, NextFunction } from "express";
import { warehouseService } from "./warehouse.service";
import respond from "../../shared/utils/response";

export async function getWarehouses(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const r = await warehouseService.getWarehouses(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, r.data, r.pagination);
  } catch (e) {
    next(e);
  }
}

export async function getWarehouseById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wh = await warehouseService.getWarehouseById(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Warehouse retrieved",
      data: { warehouse: wh },
    });
  } catch (e) {
    next(e);
  }
}

export async function getWarehouseStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await warehouseService.getWarehouseStats(
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Warehouse stats",
      data: { warehouses: stats },
    });
  } catch (e) {
    next(e);
  }
}

export async function createWarehouse(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wh = await warehouseService.createWarehouse(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Warehouse created",
      data: { warehouse: wh },
    });
  } catch (e) {
    next(e);
  }
}

export async function updateWarehouse(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wh = await warehouseService.updateWarehouse(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Warehouse updated",
      data: { warehouse: wh },
    });
  } catch (e) {
    next(e);
  }
}

export async function setDefaultWarehouse(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wh = await warehouseService.setDefault(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Default updated",
      data: { warehouse: wh },
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteWarehouse(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await warehouseService.deleteWarehouse(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.noContent(res);
  } catch (e) {
    next(e);
  }
}
