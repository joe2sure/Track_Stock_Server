import { Request, Response, NextFunction } from "express";
import { variationService } from "./variation.service";
import respond from "../../shared/utils/response";

export async function getVariations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await variationService.getVariations(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, result.data, result.pagination);
  } catch (e) {
    next(e);
  }
}

export async function getVariationById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.getVariationById(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Variation retrieved",
      data: { variation: v },
    });
  } catch (e) {
    next(e);
  }
}

export async function createVariation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.createVariation(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Variation created",
      data: { variation: v },
    });
  } catch (e) {
    next(e);
  }
}

export async function updateVariation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.updateVariation(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Variation updated",
      data: { variation: v },
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteVariation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await variationService.deleteVariation(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.noContent(res);
  } catch (e) {
    next(e);
  }
}

export async function addOption(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.addOption(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Option added", data: { variation: v } });
  } catch (e) {
    next(e);
  }
}

export async function updateOption(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.updateOption(
      req.params.id,
      req.params.optionId,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Option updated", data: { variation: v } });
  } catch (e) {
    next(e);
  }
}

export async function deleteOption(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.deleteOption(
      req.params.id,
      req.params.optionId,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Option deleted", data: { variation: v } });
  } catch (e) {
    next(e);
  }
}

export async function reorderOptions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const v = await variationService.reorderOptions(
      req.params.id,
      req.body.order,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Options reordered",
      data: { variation: v },
    });
  } catch (e) {
    next(e);
  }
}
