import env from '../../config/env';
import { PaginationMeta, PaginationQuery } from '../types';

export interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  sort: Record<string, 1 | -1>;
}

export function parsePagination(
  query: PaginationQuery,
  defaultSort = 'createdAt'
): ParsedPagination {
  const page = Math.max(1, parseInt(String(query.page || 1), 10));
  const rawLimit = parseInt(String(query.limit || env.DEFAULT_PAGE_SIZE), 10);
  const limit = Math.min(Math.max(1, rawLimit), env.MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || defaultSort;
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  return { page, limit, skip, sortBy, sortOrder, sort };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const pages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

export function buildSearchQuery(
  search: string | undefined,
  fields: string[]
): Record<string, unknown> {
  if (!search || !search.trim()) return {};

  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escapedSearch, $options: 'i' };

  if (fields.length === 1) {
    return { [fields[0]]: regex };
  }

  return {
    $or: fields.map(field => ({ [field]: regex })),
  };
}

export function buildDateRangeQuery(
  from?: string | Date,
  to?: string | Date,
  field = 'createdAt'
): Record<string, unknown> {
  if (!from && !to) return {};

  const dateFilter: Record<string, Date> = {};

  if (from) dateFilter.$gte = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    dateFilter.$lte = toDate;
  }

  return { [field]: dateFilter };
}
