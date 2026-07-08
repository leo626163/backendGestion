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

  // Fecha actual para filtrar eventos pasados
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    // Obtener todas las notificaciones del usuario de los últimos 30 días
    const notificaciones = await Notificacion.findAll({
      where: {
        idusuario: userId,
        created_at: {
          [Op.gte]: thirtyDaysAgo
        }
      },
      order: [['created_at', 'DESC']],
      attributes: ['idnotificacion', 'titulo', 'mensaje', 'tipo', 'estado', 'id_relacionado', 'created_at'],
      raw: true
    });

    // Si hay notificaciones con id_relacionado, verificar si los eventos son futuros
    const notificacionesFiltradas = await Promise.all(
      notificaciones.map(async (notif) => {
        // Si no tiene evento relacionado, incluir la notificación
        if (!notif.id_relacionado) {
          return { ...notif, evento_futuro: true };
        }

        // Buscar el evento relacionado
        const evento = await Evento.findOne({
          where: { idevento: notif.id_relacionado },
          attributes: ['idevento', 'fechaevento', 'nombreevento'],
          raw: true
        });

        // Si el evento no existe o es pasado, excluir la notificación
        if (!evento) {
          return null;
        }

        const fechaEvento = new Date(evento.fechaevento);
        const esFuturo = fechaEvento >= today;

        if (esFuturo) {
          return {
            ...notif,
            evento_futuro: true,
            fecha_evento: evento.fechaevento,
            nombre_evento: evento.nombreevento
          };
        }

        return null;
      })
    );

    // Filtrar las notificaciones nulas (eventos pasados)
    const notificacionesFinales = notificacionesFiltradas.filter(n => n !== null);

    res.json(notificacionesFinales);
  } catch (error) {
    console.error('Error al cargar notificaciones:', error);
    res.status(500).json({ error: 'Error al cargar notificaciones' });
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