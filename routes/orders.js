const express = require('express');
const router = express.Router();
const db = require('../db');


// 1. OBTENER TODAS LAS ÓRDENES
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT 
        o.id,
        o.order_number,
        o.client_name,
        o.client_phone,
        o.device_type,
        o.device_brand,
        o.device_model,
        TO_CHAR(o.received_date, 'DD/MM/YYYY') as fecha,
        TO_CHAR(o.received_date, 'YYYY-MM-DD') as fecha_iso,
        s.name as estado,
        s.id as estado_id,
        p.name as prioridad,
        p.id as prioridad_id,
        -- Última nota
        (
          SELECT description 
          FROM notes n 
          WHERE n.order_id = o.id 
          ORDER BY n.created_at DESC 
          LIMIT 1
        ) as ultima_nota,
        -- Fecha de la última nota
        (
          SELECT TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI')
          FROM notes n2 
          WHERE n2.order_id = o.id 
          ORDER BY n2.created_at DESC 
          LIMIT 1
        ) as fecha_ultima_nota,
        -- Total de notas
        (
          SELECT COUNT(*) 
          FROM notes n3 
          WHERE n3.order_id = o.id
        ) as total_notas,
        -- Tiempo desde creación
        EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 3600 as horas_desde_creacion
      FROM orders o
      LEFT JOIN statuses s ON o.status_id = s.id
      LEFT JOIN priorities p ON o.priority_id = p.id
      ORDER BY o.received_date DESC, o.id DESC
      LIMIT 100
    `;

    const result = await db.query(query);
    
  
    const ordersWithTime = result.rows.map(order => {
      const hours = Math.floor(order.horas_desde_creacion);
      let tiempoTexto = "";
      
      if (hours < 1) {
        tiempoTexto = "Hace menos de 1 hora";
      } else if (hours < 24) {
        tiempoTexto = `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
      } else {
        const days = Math.floor(hours / 24);
        tiempoTexto = `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
      }
      
      return {
        ...order,
        tiempo_desde_creacion: tiempoTexto
      };
    });
    
    res.json({
      success: true,
      count: ordersWithTime.length,
      orders: ordersWithTime
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al obtener órdenes" 
    });
  }
});


// 2. OBTENER ORDEN POR ID CON LISTA DE NOTAS COMPLETA

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Obtener información de la orden
    const orderQuery = `
      SELECT 
        o.*,
        p.name as priority_name,
        s.name as status_name
      FROM orders o
      LEFT JOIN priorities p ON o.priority_id = p.id
      LEFT JOIN statuses s ON o.status_id = s.id
      WHERE o.id = $1 AND (o.is_deleted = false OR o.is_deleted IS NULL)
    `;

    const orderResult = await db.query(orderQuery, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Orden no encontrada" 
      });
    }

    const order = orderResult.rows[0];

    // 2. Obtener todas las notas de la orden
    const notesQuery = `
      SELECT 
        id,
        description,
        created_at,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as fecha_formateada
      FROM notes
      WHERE order_id = $1
      ORDER BY created_at DESC
    `;

    const notesResult = await db.query(notesQuery, [id]);

    res.json({
      success: true,
      order: order,
      bitacora: {
        total: notesResult.rows.length,
        notas: notesResult.rows
      }
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al obtener la orden" 
    });
  }
});


// 3. BUSCAR ÓRDENES POR NÚMERO O CLIENTE
router.get("/search/:term", async (req, res) => {
  try {
    const { term } = req.params;

    const query = `
      SELECT 
        o.id,
        o.order_number,
        o.client_name,
        o.client_phone,
        o.device_type,
        o.device_brand,
        o.device_model,
        TO_CHAR(o.received_date, 'DD/MM/YYYY') as fecha,
        s.name as estado,
        p.name as prioridad
      FROM orders o
      LEFT JOIN priorities p ON o.priority_id = p.id
      LEFT JOIN statuses s ON o.status_id = s.id
      WHERE 
        (o.order_number ILIKE $1 OR
        o.client_name ILIKE $1 OR
        o.client_phone ILIKE $1 OR
        o.device_model ILIKE $1)
        AND (o.is_deleted = false OR o.is_deleted IS NULL)
      ORDER BY o.id DESC
      LIMIT 50
    `;

    const result = await db.query(query, [`%${term}%`]);
    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });
  } catch (error) {
    console.error("Error searching orders:", error);
    res.status(500).json({ 
      success: false,
      error: "Error en la búsqueda" 
    });
  }
});

// 4. CREAR NUEVA ORDEN 

router.post("/", async (req, res) => {
  console.log("POST /api/orders - Creando nueva orden");

  try {
    const {
      order_number,
      client_name,
      client_phone,
      client_email,
      priority_id,
      device_type,
      device_brand,
      device_model,
      serial_number,
      status_id,
      received_date,
      estimated_delivery,
      initial_note // Primera nota de la bitácora
    } = req.body;

    // Validaciones básicas
    if (!order_number || !client_name || !device_type) {
      return res.status(400).json({
        success: false,
        error: "Faltan campos requeridos",
        required: ["order_number", "client_name", "device_type"]
      });
    }

    await db.query("BEGIN");

    
    console.log(" Creando orden principal...");
    const orderQuery = `
      INSERT INTO orders (
        order_number,
        client_name,
        client_phone,
        client_email,
        priority_id,
        device_type,
        device_brand,
        device_model,
        serial_number,
        status_id,
        received_date,
        estimated_delivery
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;

    const orderValues = [
      order_number,
      client_name,
      client_phone || null,
      client_email || null,
      priority_id || 2, // Default: Media
      device_type,
      device_brand || null,
      device_model || null,
      serial_number || null,
      status_id || 1, // Default: Recibido
      received_date || new Date().toISOString().split("T")[0],
      estimated_delivery || null
    ];

    const orderResult = await db.query(orderQuery, orderValues);
    const orderId = orderResult.rows[0].id;
    console.log("Orden creada con ID:", orderId);

    let firstNoteId = null;

    // 2. Crear primera nota de la bitácora
    if (initial_note && initial_note.trim() !== "") {
      console.log("Creando primera nota de bitácora...");

      const noteQuery = `
        INSERT INTO notes (description, order_id)
        VALUES ($1, $2)
        RETURNING id
      `;

      const noteResult = await db.query(noteQuery, [
        initial_note.trim(),
        orderId
      ]);
      firstNoteId = noteResult.rows[0].id;
      console.log("Nota inicial creada con ID:", firstNoteId);

      // 3. Actualizar la orden con la primera nota
      await db.query(
        `UPDATE orders 
         SET notes_id = $1 
         WHERE id = $2`,
        [firstNoteId, orderId]
      );
      console.log("Orden actualizada con nota inicial");
    }

    await db.query("COMMIT");

    // 4. Obtener la orden completa con joins
    const fullOrderQuery = `
      SELECT 
        o.*,
        p.name as priority_name,
        s.name as status_name
      FROM orders o
      LEFT JOIN priorities p ON o.priority_id = p.id
      LEFT JOIN statuses s ON o.status_id = s.id
      WHERE o.id = $1
    `;

    const fullOrderResult = await db.query(fullOrderQuery, [orderId]);
    const orderData = fullOrderResult.rows[0];

    // 5. Obtener todas las notas (bitácora completa)
    const notesQuery = `
      SELECT 
        id,
        description,
        created_at,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as fecha_formateada
      FROM notes
      WHERE order_id = $1
      ORDER BY created_at
    `;

    const notesResult = await db.query(notesQuery, [orderId]);

    console.log("Orden creada exitosamente");

    res.status(201).json({
      success: true,
      message: "Orden creada exitosamente",
      order: orderData,
      bitacora: {
        total: notesResult.rows.length,
        notas: notesResult.rows
      }
    });

  } catch (error) {
    await db.query("ROLLBACK");

    console.error("ERROR:", error.message);

    let errorMessage = "Error al crear la orden";
    if (error.code === "23505") {
      errorMessage = `El número de orden '${req.body.order_number}' ya existe`;
    } else if (error.code === "23503") {
      errorMessage = "ID de prioridad o estado inválido";
    } else if (error.code === "23502") {
      errorMessage = "Campo requerido no proporcionado";
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message,
      code: error.code
    });
  }
});

// 5. ACTUALIZAR ORDEN

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validar que la orden existe
    const orderCheck = await db.query(
      'SELECT id FROM orders WHERE id = $1',
      [id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Orden no encontrada" 
      });
    }

    // Construir consulta dinámica
    const allowedFields = [
      'client_name', 'client_email', 'client_phone',
      'device_type', 'device_brand', 'device_model',
      'serial_number', 'estimated_delivery', 'priority_id',
      'status_id'  // Agregar status_id aquí también
    ];

    const validUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        validUpdates[key] = updates[key];
      }
    });

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No hay campos válidos para actualizar"
      });
    }

    const setClause = Object.keys(validUpdates)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(", ");

    const values = Object.values(validUpdates);
    values.push(id);

    // QUERY SIN updated_at
    const query = `
      UPDATE orders 
      SET ${setClause}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await db.query(query, values);

    res.json({
      success: true,
      message: "Orden actualizada correctamente",
      order: result.rows[0]
    });
  } catch (error) {
    console.error("Error updating order:", error.message);
    
    let errorMessage = "Error al actualizar la orden";
    if (error.code === "42703") {
      errorMessage = "Error en la estructura de la base de datos";
    } else if (error.code === "23503") {
      errorMessage = "ID de prioridad o estado inválido";
    }

    res.status(500).json({ 
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// 7. ACTUALIZAR PRIORIDAD

router.patch("/:id/priority", async (req, res) => {
  try {
    const { id } = req.params;
    const { priority_id } = req.body;

    // Validar que la prioridad existe
    const priorityCheck = await db.query(
      'SELECT id FROM priorities WHERE id = $1',
      [priority_id]
    );

    if (priorityCheck.rows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "ID de prioridad inválido" 
      });
    }

    const query = `
      UPDATE orders 
      SET priority_id = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [priority_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Orden no encontrada" 
      });
    }

    const priorityNameQuery = await db.query(
      'SELECT name FROM priorities WHERE id = $1',
      [priority_id]
    );

    res.json({
      success: true,
      message: "Prioridad actualizada correctamente",
      order: {
        ...result.rows[0],
        priority_name: priorityNameQuery.rows[0]?.name || 'Desconocida'
      }
    });
  } catch (error) {
    console.error("Error updating priority:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al actualizar la prioridad" 
    });
  }
});


// 7. ELIMINAR ORDEN 

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que existe
    const orderCheck = await db.query(
      'SELECT id, order_number FROM orders WHERE id = $1',
      [id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Orden no encontrada" 
      });
    }

    await db.query('BEGIN');

    // 2. Eliminar orden
    const deleteOrder = await db.query(
      'DELETE FROM orders WHERE id = $1 RETURNING id, order_number',
      [id]
    );

    await db.query('COMMIT');

    res.json({
      success: true,
      message: "Orden eliminada permanentemente",
      orden: deleteOrder.rows[0]
    });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error("Error:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Error al eliminar" 
    });
  }
});

// 8. DATOS MAESTROS (prioridades y estados)

router.get("/data/masters", async (req, res) => {
  try {
    const [prioritiesResult, statusesResult] = await Promise.all([
      db.query("SELECT * FROM priorities ORDER BY id"),
      db.query("SELECT * FROM statuses ORDER BY id")
    ]);

    res.json({
      success: true,
      priorities: prioritiesResult.rows,
      statuses: statusesResult.rows
    });
  } catch (error) {
    console.error("Error fetching master data:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al obtener datos maestros" 
    });
  }
});



// 6. ACTUALIZAR ESTADO DE ORDEN
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id } = req.body;

    if (!status_id) {
      return res.status(400).json({ 
        success: false,
        error: "El ID de estado es requerido" 
      });
    }

    // Validar que el estado existe
    const statusCheck = await db.query(
      'SELECT id, name FROM statuses WHERE id = $1',
      [status_id]
    );

    if (statusCheck.rows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "ID de estado inválido" 
      });
    }

    // Validar que la orden existe
    const orderCheck = await db.query(
      'SELECT id FROM orders WHERE id = $1',
      [id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Orden no encontrada" 
      });
    }

    // Actualizar estado
    const query = `
      UPDATE orders 
      SET status_id = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [status_id, id]);

    res.json({
      success: true,
      message: "Estado actualizado correctamente",
      order: {
        ...result.rows[0],
        status_name: statusCheck.rows[0].name
      }
    });

  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al actualizar el estado" 
    });
  }
});


module.exports = router;
