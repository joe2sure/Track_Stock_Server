import { Request, Response, NextFunction } from "express";
import { categoryService } from "./category.service";
import respond from "../../shared/utils/response";

export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await categoryService.getCategories(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(res, result.data, result.pagination);
  } catch (e) {
    next(e);
  }
}

export async function getCategoryTree(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tree = await categoryService.getCategoryTree(
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Category tree retrieved",
      data: { categories: tree },
    });
  } catch (e) {
    next(e);
  }
}

export async function getCategoryById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cat = await categoryService.getCategoryById(
      req.params.id as string,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Category retrieved",
      data: { category: cat },
    });
  } catch (e) {
    next(e);
  }
}

export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cat = await categoryService.createCategory(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Category created",
      data: { category: cat },
    });
  } catch (e) {
    next(e);
  }
}

export async function updateCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cat = await categoryService.updateCategory(
      req.params.id as string,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Category updated",
      data: { category: cat },
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await categoryService.deleteCategory(
      req.params.id as string,
      req.user?.tenantId ?? "default",
    );
    respond.noContent(res);
  } catch (e) {
    next(e);
  }
}

export async function reorderCategories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await categoryService.reorderCategories(
      req.body.items,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Categories reordered" });
  } catch (e) {
    next(e);
  }
}

export async function getCategoryStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await categoryService.getCategoryStats(
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Stats retrieved", data: { stats } });
  } catch (e) {
    next(e);
  }
}
