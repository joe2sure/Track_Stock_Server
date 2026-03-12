import { Router } from 'express';
import * as ctrl from './currency.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { addCurrencySchema, updateRatesSchema, convertSchema } from './currency.validation';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'accountant';
const mgr:  Role[] = ['super_admin','admin','manager'];
const acct: Role[] = ['super_admin','admin','manager','accountant'];

router.get('/',                  ctrl.getCurrencies);
router.post('/convert',          validate(convertSchema),      ctrl.convertCurrency);
router.post('/seed',             authorize(...mgr),             ctrl.seedCurrencies);
router.post('/',                 authorize(...mgr),  validate(addCurrencySchema),   ctrl.addCurrency);
router.put('/rates',             authorize(...acct), validate(updateRatesSchema),   ctrl.updateExchangeRates);
router.patch('/:id/toggle',      authorize(...mgr),             ctrl.toggleCurrency);

export default router;
