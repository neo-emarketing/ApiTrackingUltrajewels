require("dotenv").config();
const express = require('express');
const cors = require('cors');


const app = express();
const PORT = process.env.PORT || 3000;
const requireAuth = require("./middleware/requireAuth");


app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'tracking-service-khaki.vercel.app'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100
}); 
const clientLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 20, 
  message: {
    error: 'Límite de peticiones excedido',
    message: 'Solo puede realizar 5 peticiones por hora',
    retryAfter: '1 hora'
  },
  standardHeaders: true, 
  legacyHeaders: false, 
  skipSuccessfulRequests: false, 
  skipFailedRequests: false 
});
app.use('/api/', limiter);

// rutas
const ordersRouter = require('./routes/orders');
app.use('/api/orders', requireAuth,  ordersRouter);

const notesRouter = require('./routes/notes');
app.use('/api/notes', requireAuth,  notesRouter);

const clientRouter = require('./routes/client');
app.use('/api', clientLimiter, clientRouter);

const dashboardRouter = require('./routes/dashboard');
app.use('/api', dashboardRouter, requireAuth);
// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'APIfuncionando',
  
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});