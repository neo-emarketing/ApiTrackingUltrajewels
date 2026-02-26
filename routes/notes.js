const express = require("express");
const db = require("../db.js");
const router = express.Router();

// 1. AGREGAR NOTA A ORDEN
router.post("/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ 
        success: false,
        error: "La descripción es requerida" 
      });
    }

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

    const noteQuery = `
      INSERT INTO notes (description, order_id)
      VALUES ($1, $2)
      RETURNING *
    `;

    const noteResult = await db.query(noteQuery, [description.trim(), id]);

      
    await db.query(
      "UPDATE orders SET notes_id = $1 WHERE id = $2",
      [noteResult.rows[0].id, id]
    );

    res.status(201).json({
      success: true,
      message: "Nota agregada correctamente",
      note: noteResult.rows[0]
    });
  } catch (error) {
    console.error("Error adding note:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al agregar nota" 
    });
  }
});

// 2. OBTENER NOTAS DE UNA ORDEN
router.get("/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        id,
        description,
        created_at,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as fecha_formateada
      FROM notes
      WHERE order_id = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [id]);

    res.json({
      success: true,
      count: result.rows.length,
      notes: result.rows
    });
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al obtener notas" 
    });
  }
});


// 3. ACTUALIZAR NOTA
router.put("/:orderId/notes/:noteId", async (req, res) => {
  try {
    const { orderId, noteId } = req.params;
    const { description } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ 
        success: false,
        error: "La descripción es requerida" 
      });
    }

    // Verificar que la nota pertenece a la orden
    const checkQuery = `
      SELECT id FROM notes 
      WHERE id = $1 AND order_id = $2
    `;
    
    const checkResult = await db.query(checkQuery, [noteId, orderId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Nota no encontrada para esta orden" 
      });
    }

    
    const updateQuery = `
      UPDATE notes 
      SET description = $1
      WHERE id = $2 AND order_id = $3
      RETURNING *
    `;

    const result = await db.query(updateQuery, [description.trim(), noteId, orderId]);

    res.json({
      success: true,
      message: "Nota actualizada correctamente",
      note: result.rows[0]
    });
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al actualizar nota" 
    });
  }
});


// 4. ELIMINAR NOTA
router.delete("/:orderId/notes/:noteId", async (req, res) => {
  try {
    const { orderId, noteId } = req.params;

    // Verificar que la nota pertenece a la orden
    const checkQuery = `
      SELECT id FROM notes 
      WHERE id = $1 AND order_id = $2
    `;
    
    const checkResult = await db.query(checkQuery, [noteId, orderId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Nota no encontrada para esta orden" 
      });
    }

    await db.query('DELETE FROM notes WHERE id = $1', [noteId]);

    
    const lastNoteQuery = `
      SELECT id FROM notes 
      WHERE order_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    const lastNote = await db.query(lastNoteQuery, [orderId]);
    
    if (lastNote.rows.length > 0) {
      await db.query(
        'UPDATE orders SET notes_id = $1 WHERE id = $2',
        [lastNote.rows[0].id, orderId]
      );
    } else {
      
      await db.query(
        'UPDATE orders SET notes_id = NULL WHERE id = $1',
        [orderId]
      );
    }

    res.json({
      success: true,
      message: "Nota eliminada correctamente"
    });
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).json({ 
      success: false,
      error: "Error al eliminar nota" 
    });
  }
});

module.exports = router;