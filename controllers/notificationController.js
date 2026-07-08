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
  const models = getModels();
  const { Notificacion, Evento } = models;

  const userId = req.user?.idusuario || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    // Obtener todas las notificaciones de los últimos 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const notificaciones = await Notificacion.findAll({
      where: {
        idusuario: userId,
        created_at: {
          [Op.gte]: thirtyDaysAgo
        }
      },
      order: [['created_at', 'DESC']],
      raw: true
    });

    // Para cada notificación, verificar si el evento relacionado es futuro
    const notificacionesConInfo = await Promise.all(
      notificaciones.map(async (notif) => {
        const resultado = {
          idnotificacion: notif.idnotificacion,
          titulo: notif.titulo,
          mensaje: notif.mensaje,
          tipo: notif.tipo,
          estado: notif.estado,
          id_relacionado: notif.id_relacionado,
          created_at: notif.created_at,
          evento_pasado: false,
          fecha_evento: null
        };

        // Si tiene evento relacionado, verificar la fecha
        if (notif.id_relacionado) {
          try {
            const evento = await Evento.findOne({
              where: { idevento: notif.id_relacionado },
              attributes: ['fechaevento'],
              raw: true
            });

            if (evento && evento.fechaevento) {
              const fechaEvento = new Date(evento.fechaevento);
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              
              // Marcar si el evento ya pasó
              resultado.evento_pasado = fechaEvento < hoy;
              resultado.fecha_evento = evento.fechaevento;
            }
          } catch (e) {
            console.warn(`No se pudo verificar evento ${notif.id_relacionado}:`, e.message);
          }
        }

        return resultado;
      })
    );

    // FILTRAR: Solo devolver notificaciones de eventos futuros o sin evento
    const notificacionesFiltradas = notificacionesConInfo.filter(n => !n.evento_pasado);

    console.log(`✅ Notificaciones: ${notificaciones.length} totales, ${notificacionesFiltradas.length} después de filtrar eventos pasados`);

    res.json(notificacionesFiltradas);
  } catch (error) {
    console.error('❌ Error al cargar notificaciones:', error);
    res.status(500).json({ error: 'Error al cargar notificaciones', details: error.message });
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
  read
};