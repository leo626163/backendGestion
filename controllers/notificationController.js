const asyncHandler = require('express-async-handler');
const { getModels } = require('../models/index.js'); 
const { Op } = require('sequelize');

const sendNotification = async ({ idusuario, titulo, mensaje, tipo = 'nuevo_evento', estado = 'pendiente', id_relacionado = null }) => {
  try {
    if (Array.isArray(idusuario)) {
      for (const id of idusuario) {
        await sendNotification({ idusuario: id, titulo, mensaje, tipo, estado });
      }
      return;
    }

    if (!idusuario) {
      console.warn('⚠️ sendNotification: idusuario no proporcionado');
      return;
    }
    
    const models = getModels();
    const sequelize = models.sequelize;
    
    await sequelize.query(
      `INSERT INTO notificacion (idusuario, titulo, mensaje, tipo, estado, id_relacionado, created_at, updated_at) 
       VALUES (:idusuario, :titulo, :mensaje, :tipo, :estado, :id_relacionado, :created_at, :updated_at)`,
      {
        replacements: {
          idusuario,
          titulo,
          mensaje,
          tipo,
          estado,
          id_relacionado,
          created_at: new Date(),
          updated_at: new Date(),
        },
        type: sequelize.QueryTypes.INSERT
      }
    );

    console.log(`✅ Notificación enviada a usuario ${idusuario}`);

  } catch (error) {
    console.error('❗ Error al crear notificación:', error.message);
  }
};

const getUserNotifications = asyncHandler(async (req, res) => {
  try {
    const models = getModels();
    
    // Verificar que el modelo existe
    if (!models.Notificacion) {
      console.error('❌ Modelo Notificacion no existe');
      console.log('Modelos disponibles:', Object.keys(models));
      return res.status(500).json({ 
        error: 'Modelo Notificacion no encontrado',
        modelosDisponibles: Object.keys(models)
      });
    }
    
    const { Notificacion, Evento } = models;
    const userId = req.user?.idusuario || req.user?.id;
    
    if (!userId) {
      console.error('❌ Usuario no autenticado');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    console.log('🔍 Buscando notificaciones para usuario ID:', userId);

    // PRIMERO: Consulta MUY SIMPLE sin filtros de fecha
    let notificaciones;
    try {
      notificaciones = await Notificacion.findAll({
        where: { idusuario: userId },
        order: [['created_at', 'DESC']],
        limit: 50,
        raw: true
      });
      console.log(`✅ Consulta simple: ${notificaciones.length} notificaciones encontradas`);
    } catch (dbError) {
      console.error('❌ Error en consulta simple:', dbError.message);
      console.error('SQL:', dbError.sql);
      
      // Si falla, intentar sin order
      try {
        notificaciones = await Notificacion.findAll({
          where: { idusuario: userId },
          limit: 50,
          raw: true
        });
        console.log(`✅ Consulta sin order: ${notificaciones.length} notificaciones`);
      } catch (dbError2) {
        console.error('❌ Error en consulta sin order:', dbError2.message);
        return res.status(500).json({ 
          error: 'Error en base de datos',
          details: dbError2.message,
          sql: dbError2.sql
        });
      }
    }

    // Si no hay notificaciones, devolver array vacío
    if (!notificaciones || notificaciones.length === 0) {
      return res.json([]);
    }

    // Verificar que Evento existe antes de usarlo
    if (!Evento) {
      console.warn('⚠️ Modelo Evento no existe, devolviendo notificaciones sin enriquecer');
      return res.json(notificaciones);
    }

    // Enriquecer con info de eventos
    const notificacionesConInfo = await Promise.all(
      notificaciones.map(async (notif) => {
        const notifData = { ...notif, evento_pasado: false };
        
        if (notif.id_relacionado) {
          try {
            const evento = await Evento.findOne({
              where: { idevento: notif.id_relacionado },
              raw: true
            });

            if (evento) {
              // Buscar la columna de fecha (puede tener diferentes nombres)
              const fechaEvento = evento.fechaevento || evento.fecha_evento || evento.fecha;
              
              if (fechaEvento) {
                const fecha = new Date(fechaEvento);
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                
                notifData.evento_pasado = fecha < hoy;
                notifData.fecha_evento = fechaEvento;
                notifData.nombre_evento = evento.nombreevento || evento.nombre_evento || evento.nombre;
              }
            }
          } catch (e) {
            console.warn(`No se pudo cargar evento ${notif.id_relacionado}:`, e.message);
          }
        }

        return notifData;
      })
    );

    // Filtrar solo eventos futuros o sin evento
    const notificacionesFiltradas = notificacionesConInfo.filter(n => !n.evento_pasado);

    console.log(`📬 Total: ${notificaciones.length}, Filtradas: ${notificacionesFiltradas.length}`);

    res.json(notificacionesFiltradas);

  } catch (error) {
    console.error('❌ ERROR en getUserNotifications:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Ruta de diagnóstico
const diagnosticarNotificaciones = asyncHandler(async (req, res) => {
  try {
    const models = getModels();
    
    const resultado = {
      modelosDisponibles: Object.keys(models),
      notificacionExiste: !!models.Notificacion,
      eventoExiste: !!models.Evento,
    };

    if (models.Notificacion) {
      // Obtener estructura de la tabla
      const sequelize = models.sequelize;
      const [results] = await sequelize.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'notificacion'
      `);
      resultado.columnasNotificacion = results;
      
      // Contar notificaciones
      const count = await models.Notificacion.count();
      resultado.totalNotificaciones = count;
    }

    if (models.Evento) {
      const sequelize = models.sequelize;
      const [results] = await sequelize.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'evento'
      `);
      resultado.columnasEvento = results;
    }

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const read = asyncHandler(async (req, res) => {
  const models = getModels();
  const { Notificacion } = models;

  const { id } = req.params;
  const userId = req.user?.idusuario || req.user?.id;
  
  if (!userId) return res.status(401).json({ message: 'Usuario no autenticado' });

  const [updated] = await Notificacion.update(
    { estado: 'leido', updated_at: new Date() },
    { where: { idnotificacion: id, idusuario: userId } }
  );

  if (updated === 0) return res.status(404).json({ message: 'Notificación no encontrada' });

  res.json({ success: true, message: 'Notificación marcada como leída' });
});

const markAsRead = asyncHandler(async (req, res) => {
  const models = getModels();
  const { Notificacion } = models;

  const notificationId = req.params.id;
  const userId = req.user?.idusuario || req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const [updated] = await Notificacion.update(
    { estado: 'leido', updated_at: new Date() },
    {
      where: {
        idnotificacion: notificationId,
        idusuario: userId
      }
    }
  );

  if (updated === 0) {
    return res.status(404).json({ error: 'Notificación no encontrada' });
  }

  res.json({ success: true, message: 'Notificación marcada como leída' });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const models = getModels();
  const { Notificacion } = models;

  const userId = req.user?.idusuario || req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const [updated] = await Notificacion.update(
    { estado: 'leido', updated_at: new Date() },
    {
      where: {
        idusuario: userId,
        estado: { [Op.ne]: 'leido' }
      }
    }
  );

  res.json({ 
    success: true, 
    message: 'Todas las notificaciones marcadas como leídas',
    updated_count: updated 
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const models = getModels();
  const { Notificacion } = models;

  const userId = req.user?.idusuario || req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const count = await Notificacion.count({
    where: {
      idusuario: userId,
      estado: { [Op.ne]: 'leido' } 
    }
  });

  res.json({ unread_count: count });
});

module.exports = {
  sendNotification,        
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  read,
  diagnosticarNotificaciones
};