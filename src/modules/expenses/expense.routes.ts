import { Router } from 'express';
import * as ctrl from './expense.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
  createExpenseSchema, reviewExpenseSchema, payExpenseSchema,
} from './expense.validation';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'accountant';
const mgr:  Role[] = ['super_admin','admin','manager'];
const acct: Role[] = ['super_admin','admin','manager','accountant'];

router.get('/stats',         authorize(...acct), ctrl.getExpenseStats);
router.get('/categories',    ctrl.getExpenseCategories);
router.get('/',              ctrl.getExpenses);
router.get('/:id',           ctrl.getExpenseById);

router.post('/',             validate(createExpenseSchema),   ctrl.createExpense);
router.put('/:id',           validate(createExpenseSchema.fork(['title','category','amount','expenseDate'], s => s.optional())), ctrl.updateExpense);
router.patch('/:id/submit',                                   ctrl.submitExpense);
router.patch('/:id/review',  authorize(...mgr),  validate(reviewExpenseSchema),  ctrl.reviewExpense);
router.patch('/:id/pay',     authorize(...acct), validate(payExpenseSchema),     ctrl.payExpense);
router.patch('/:id/cancel',                                   ctrl.cancelExpense);

export default router;
