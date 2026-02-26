const express = require("express");
const db = require("../db.js");
const router = express.Router();

router.get("/cliente/:orderNumber", async (req, res) => {
  try {
    const { orderNumber } = req.params;
    if (!/^\d{3,6}$/.test(orderNumber)) {
      return res.status(400).json({
        success: false,
        error: "Número de orden inválido",
      });
    }
    const query = `
      SELECT 
        o.order_number,
        o.device_type,
        o.device_brand,
        o.device_model,
        o.serial_number,
        o.received_date,
        o.estimated_delivery,
        s.name as estado_actual,
        (
          SELECT TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI')
          FROM notes n 
          WHERE n.order_id = o.id 
          ORDER BY n.created_at DESC 
          LIMIT 1
        ) as ultima_actualizacion
      FROM orders o
      LEFT JOIN statuses s ON o.status_id = s.id
      WHERE o.order_number = $1 
        AND (o.is_deleted = false OR o.is_deleted IS NULL)
      LIMIT 1
    `;

    const result = await db.query(query, [orderNumber]);

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Orden no encontrada",
      });
    }

    res.json({
      success: true,
      orden: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching client order:", error);
    res.status(500).json({
      success: false,
      error: "Error al obtener información de la orden",
    });
  }
});


module.exports = router;