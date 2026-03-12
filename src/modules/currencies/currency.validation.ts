import Joi from 'joi';

export const addCurrencySchema = Joi.object({
  code:          Joi.string().trim().uppercase().length(3).required(),
  name:          Joi.string().trim().min(2).max(100).required(),
  symbol:        Joi.string().trim().min(1).max(5).required(),
  exchangeRate:  Joi.number().positive().required(),
  decimalPlaces: Joi.number().integer().min(0).max(4).default(2),
});

export const updateRatesSchema = Joi.object({
  rates: Joi.array().items(
    Joi.object({
      code:         Joi.string().trim().uppercase().length(3).required(),
      exchangeRate: Joi.number().positive().required(),
    })
  ).min(1).required(),
});

export const convertSchema = Joi.object({
  amount:   Joi.number().positive().required(),
  fromCode: Joi.string().trim().uppercase().length(3).required(),
  toCode:   Joi.string().trim().uppercase().length(3).required(),
});
