/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Paystack payment processing — initialize, verify, webhook
 */

/**
 * @swagger
 * /payments/initialize:
 *   post:
 *     summary: Initialize a Paystack payment
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, amountNGN, entityType]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: customer@example.com
 *               amountNGN:
 *                 type: number
 *                 example: 25000
 *                 description: Amount in Naira (not kobo)
 *               entityType:
 *                 type: string
 *                 enum: [sale, booking, purchase, expense, other]
 *               entityId:
 *                 type: string
 *                 description: MongoDB ID of the related entity
 *               entityRef:
 *                 type: string
 *                 example: ORD-202501-0001
 *               customerName:
 *                 type: string
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Payment initialized — redirect user to authorizationUrl
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     reference:
 *                       type: string
 *                       example: EBN-DFLT-M8XZ-A1B2C3D4
 *                     authorizationUrl:
 *                       type: string
 *                       example: https://checkout.paystack.com/abc123
 *                     accessCode:
 *                       type: string
 */

/**
 * @swagger
 * /payments/verify/{reference}:
 *   get:
 *     summary: Verify a payment by reference
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         example: EBN-DFLT-M8XZ-A1B2C3D4
 *     responses:
 *       200:
 *         description: Payment verification result
 */

/**
 * @swagger
 * /payments/{reference}:
 *   get:
 *     summary: Get payment record by reference
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment record
 */

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List all payments
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed, abandoned, reversed]
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [sale, booking, purchase, expense, other]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Paginated payment list
 */

/**
 * @swagger
 * /payments/paystack/webhook:
 *   post:
 *     summary: Paystack webhook receiver
 *     tags: [Payments]
 *     description: |
 *       **Public endpoint — no authentication required.**
 *       Receives signed webhook events from Paystack.
 *       Validate your webhook URL in the Paystack dashboard.
 *       Always returns HTTP 200 to prevent Paystack retries.
 *     parameters:
 *       - in: header
 *         name: x-paystack-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA512 signature from Paystack
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 example: charge.success
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook received (always 200)
 */
export {};
