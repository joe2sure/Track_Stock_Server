import { Request, Response, NextFunction } from "express";
import { unitService } from "./unit.service";
import respond from "../../shared/utils/response";

export async function getUnits(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await unitService.getUnits(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, result.data, result.pagination);
  } catch (e) {
    next(e);
  }
}

export async function getUnitsByType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const grouped = await unitService.getUnitsByType(
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Units by type",
      data: { units: grouped },
    });
  } catch (e) {
    next(e);
  }
}

export async function getUnitById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const unit = await unitService.getUnitById(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Unit retrieved", data: { unit } });
  } catch (e) {
    next(e);
  }
}

export async function createUnit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const unit = await unitService.createUnit(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, { message: "Unit created", data: { unit } });
  } catch (e) {
    next(e);
  }
}

export async function updateUnit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const unit = await unitService.updateUnit(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Unit updated", data: { unit } });
  } catch (e) {
    next(e);
  }
}

export async function deleteUnit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await unitService.deleteUnit(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.noContent(res);
  } catch (e) {
    next(e);
  }
}

export async function seedUnits(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await unitService.seedDefaults(
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "Default units seeded successfully" });
  } catch (e) {
    next(e);
  }
}
