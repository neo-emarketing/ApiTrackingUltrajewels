const express = require('express');
const router = express.Router();
const db = require('../db');


router.get('/dashboard/stats', async (req, res) => {
    console.log('Dashboard stats solicitado');
    
    try {
        //  Total de órdenes
        const totalQuery = `
            SELECT COUNT(*) as total
            FROM orders 
            WHERE is_deleted = false OR is_deleted IS NULL
        `;

        // Órdenes por estado
        const statusQuery = `
            SELECT 
                s.id,
                s.name,
                COUNT(o.id) as cantidad
            FROM statuses s
            LEFT JOIN orders o ON s.id = o.status_id 
                AND (o.is_deleted = false OR o.is_deleted IS NULL)
            GROUP BY s.id, s.name
            ORDER BY s.id
        `;

           // Órdenes recientes
        const recentQuery = `
            SELECT 
                o.id,
                o.order_number,
                o.client_name,
                o.device_type,
                o.device_brand,
                -- Timestamp para cálculo
                COALESCE(o.created_at, o.received_date) as fecha_timestamp,
                -- String formateado para display
                TO_CHAR(
                    COALESCE(o.created_at, o.received_date), 
                    'DD/MM/YYYY HH24:MI'
                ) as creado_el,
                s.name as estado
            FROM orders o
            LEFT JOIN statuses s ON o.status_id = s.id
            WHERE o.is_deleted = false OR o.is_deleted IS NULL
            ORDER BY COALESCE(o.created_at, o.received_date) DESC
            LIMIT 5
        `;

        //  Órdenes por prioridad
        const priorityQuery = `
            SELECT 
                p.name as prioridad,
                COUNT(o.id) as cantidad
            FROM priorities p
            LEFT JOIN orders o ON p.id = o.priority_id
                AND (o.is_deleted = false OR o.is_deleted IS NULL)
            GROUP BY p.id, p.name
            ORDER BY p.id
        `;

        // Ejecutar todas las consultas en paralelo
        const [totalResult, statusResult, recentResult, priorityResult] = await Promise.all([
            db.query(totalQuery),
            db.query(statusQuery),
            db.query(recentQuery),
            db.query(priorityQuery)
        ]);

      
        function parseCustomDate(dateStr) {
            if (!dateStr) return new Date();
            
            
            if (dateStr instanceof Date) return dateStr;
            
            
            if (typeof dateStr === 'string' && dateStr.includes('/')) {
                const [datePart, timePart = '00:00'] = dateStr.split(' ');
                const [day, month, year] = datePart.split('/').map(Number);
                const [hour, minute] = timePart.split(':').map(Number);
                
                
                return new Date(year, month - 1, day, hour, minute);
            }
            
            
            return new Date(dateStr);
        }

        
        const recentWithTime = recentResult.rows.map(order => {
            
            const fechaSource = order.fecha_timestamp || order.creado_el;
            const created = parseCustomDate(fechaSource);
            const now = new Date();
            
            
            if (isNaN(created.getTime())) {
                return {
                    ...order,
                    tiempo_desde_creacion: 'Fecha inválida',
                    fecha_timestamp: null
                };
            }
            
            const diffMs = now - created;
            
            
            if (diffMs < 0) {
                return {
                    ...order,
                    tiempo_desde_creacion: 'Reciente',
                    fecha_iso: created.toISOString()
                };
            }
            
            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            const diffDays = Math.floor(diffHours / 24);
            
            let tiempoTexto = '';
            
            if (diffSeconds < 60) {
                tiempoTexto = 'Hace unos segundos';
            } else if (diffMinutes < 60) {
                tiempoTexto = `Hace ${diffMinutes} minuto${diffMinutes === 1 ? '' : 's'}`;
            } else if (diffHours < 24) {
                tiempoTexto = `Hace ${diffHours} hora${diffHours === 1 ? '' : 's'}`;
            } else if (diffDays < 30) {
                tiempoTexto = `Hace ${diffDays} día${diffDays === 1 ? '' : 's'}`;
            } else {
                const diffMonths = Math.floor(diffDays / 30);
                tiempoTexto = `Hace ${diffMonths} mes${diffMonths === 1 ? '' : 'es'}`;
            }
            
            return {
                ...order,
                tiempo_desde_creacion: tiempoTexto,
                
                fecha_iso: created.toISOString()
            };
        });

        
        res.json({
            success: true,
            stats: {
                total_ordenes: parseInt(totalResult.rows[0].total),
                por_estado: statusResult.rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    cantidad: parseInt(row.cantidad)
                })),
                por_prioridad: priorityResult.rows.map(row => ({
                    prioridad: row.prioridad,
                    cantidad: parseInt(row.cantidad)
                })),
                recientes: recentWithTime,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error en dashboard stats:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener estadísticas',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


module.exports = router;