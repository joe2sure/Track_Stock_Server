import Joi from 'joi';
import { ALL_PERMISSIONS } from './role.model';

export const createRoleSchema = Joi.object({
  name:        Joi.string().trim().lowercase().min(2).max(50).pattern(/^[a-z0-9_]+$/).required()
                .messages({ 'string.pattern.base': 'Role name must be lowercase letters, numbers, and underscores only' }),
  displayName: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().max(500).optional(),
  permissions: Joi.array().items(Joi.string().valid(...ALL_PERMISSIONS)).min(1).required(),
});

export const updateRoleSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(100).optional(),
  description: Joi.string().max(500).optional(),
  permissions: Joi.array().items(Joi.string().valid(...ALL_PERMISSIONS)).min(1).optional(),
}).min(1);

export const cloneRoleSchema = Joi.object({
  newName: Joi.string().trim().lowercase().min(2).max(50).pattern(/^[a-z0-9_]+$/).required(),
});
