import swaggerJsdoc from 'swagger-jsdoc';
import env from './env';

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'TrackStock Inventory Management API',
    version: '1.0.0',
    description: `
# TrackStock AI-Integrated Inventory Management System

A comprehensive REST API powering the TrackStock Inventory Management Platform —
covering POS, Products, Stock, Purchases, Hotel, Staff, Assets, Expenses,
and all configuration modules.

## Authentication
This API uses **Bearer JWT tokens**. Obtain an access token from \`/api/v1/auth/login\`
and include it as:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Rate Limiting
- General endpoints: **100 requests / 15 minutes** per IP
- Auth endpoints: **10 requests / 15 minutes** per IP

## Pagination
Most list endpoints support:
- \`page\` (default: 1)
- \`limit\` (default: 20, max: 100)
- \`search\` — full-text search
- \`sortBy\` — field to sort by
- \`sortOrder\` — \`asc\` or \`desc\`

## Response Format
All responses follow the standard envelope:
\`\`\`json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "pagination": { "page": 1, "limit": 20, "total": 150, "pages": 8 }
}
\`\`\`
    `,
    contact: {
      name: 'TrackStock Tech Support',
      email: 'dev@TrackStock.com',
      url: 'https://TrackStock.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: `${env.API_BASE_URL}/api/${env.API_VERSION}`,
      description: env.NODE_ENV === 'production' ? 'Production Server' : 'Development Server',
    },
    {
      url: 'https://api.TrackStock.com/api/v1',
      description: 'Production Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token obtained from /auth/login',
      },
      RefreshToken: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description: 'HTTP-only refresh token cookie',
      },
    },
    schemas: {
      // ── Shared Schemas ─────────────────────────────────────────────────────
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation successful' },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Something went wrong' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
          stack: {
            type: 'string',
            description: 'Only included in development mode',
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 150 },
          pages: { type: 'integer', example: 8 },
          hasNext: { type: 'boolean', example: true },
          hasPrev: { type: 'boolean', example: false },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'array', items: {} },
          pagination: { $ref: '#/components/schemas/PaginationMeta' },
        },
      },
      MongoId: {
        type: 'string',
        pattern: '^[a-f\\d]{24}$',
        example: '507f1f77bcf86cd799439011',
        description: 'MongoDB ObjectId',
      },
      Timestamp: {
        type: 'object',
        properties: {
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    parameters: {
      PageParam: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1, minimum: 1 },
        description: 'Page number',
      },
      LimitParam: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        description: 'Items per page',
      },
      SearchParam: {
        name: 'search',
        in: 'query',
        schema: { type: 'string' },
        description: 'Search query string',
      },
      SortByParam: {
        name: 'sortBy',
        in: 'query',
        schema: { type: 'string', default: 'createdAt' },
        description: 'Field to sort by',
      },
      SortOrderParam: {
        name: 'sortOrder',
        in: 'query',
        schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        description: 'Sort direction',
      },
      IdParam: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { $ref: '#/components/schemas/MongoId' },
        description: 'Resource ID',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Authentication required. Please login.' },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'You do not have permission to perform this action.' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Resource not found.' },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              success: false,
              message: 'Validation failed',
              errors: [{ field: 'email', message: 'Invalid email format' }],
            },
          },
        },
      },
      TooManyRequests: {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Too many requests. Please try again later.' },
          },
        },
      },
      InternalError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'An internal server error occurred.' },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Auth',          description: 'Authentication & session management' },
    { name: 'Users',         description: 'User management & profiles' },
    { name: 'Products',      description: 'Product catalog management' },
    { name: 'Categories',    description: 'Product categories' },
    { name: 'Brands',        description: 'Product brands' },
    { name: 'Variations',    description: 'Product variations & attributes' },
    { name: 'Units',         description: 'Units of measurement' },
    { name: 'Stock',         description: 'Inventory & stock management' },
    { name: 'Sales',         description: 'POS & sales management' },
    { name: 'Purchases',     description: 'Purchase orders management' },
    { name: 'Hotel',         description: 'Hotel module — rooms, bookings, folio' },
    { name: 'Staff',         description: 'Staff management & attendance' },
    { name: 'Assets',        description: 'Asset tracking & maintenance' },
    { name: 'Expenses',      description: 'Expense management & categories' },
    { name: 'Suppliers',     description: 'Supplier management' },
    { name: 'Warehouses',    description: 'Warehouse management' },
    { name: 'Roles',         description: 'Roles & permissions' },
    { name: 'Currencies',    description: 'Currency management' },
    { name: 'Settings',      description: 'Application settings' },
    { name: 'Reports',       description: 'Business reports & analytics' },
    { name: 'Notifications', description: 'Push & email notifications' },
    { name: 'Payments',      description: 'Paystack payment processing' },
    { name: 'Media',         description: 'Cloudinary media management' },
    { name: 'Health',        description: 'Server health & status' },
  ],
  security: [{ BearerAuth: [] }],
};

const swaggerOptions: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  apis: [
    './src/modules/**/*.routes.ts',
    './src/modules/**/*.controller.ts',
    './src/shared/**/*.ts',
  ],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export { swaggerSpec, swaggerOptions };
export default swaggerSpec;
