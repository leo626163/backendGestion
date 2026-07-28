const { getModels } = require('../models/index.js');

async function esResponsableDelEvento(evento, usuario) {
  if (!usuario) return false;
  if (usuario.role === 'admin') return true;
  
  // Flexibilidad por si el nombre de la columna varía en tu base de datos
  const idResponsable = evento.idusuario_responsable || evento.id_responsable || evento.idacademico || evento.idusuario;
  
  if (idResponsable && Number(idResponsable) === Number(usuario.id)) return true;
  
  return false;
}

// GET /eventos/:id/informe
const getInformeEvento = async (req, res) => {
  try {
    const { InformeEvento, Evento } = getModels();

    const idevento = Number(req.params.id);
    if (isNaN(idevento)) {
      return res.status(400).json({ message: 'ID de evento inválido' });
    }

    // 1. Obtenemos el evento. Si las asociaciones fallan, lo intentamos sin includes.
    let evento;
    try {
      evento = await Evento.findByPk(idevento, {
        include: [
          { model: getModels().Resultados, required: false },
          { model: getModels().Egresos, required: false },
          { model: getModels().Ingresos, required: false },
          { model: getModels().Presupuesto, required: false },
        ],
      });
    } catch (assocError) {
      console.warn('⚠️ Error en asociaciones de Evento, intentando sin includes:', assocError.message);
      evento = await Evento.findByPk(idevento);
    }

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    // 2. Búsqueda segura del informe
    const informe = await InformeEvento.findOne({ where: { idevento } });

    // 3. Extracción defensiva de datos (evita errores si Resultados es undefined o no es un array)
    const resultados = Array.isArray(evento.Resultados) ? evento.Resultados : (evento.resultados || []);
    const primerResultado = resultados[0] || {};
    
    const presupuesto = evento.Presupuesto || evento.presupuesto || {};
    const egresos = evento.Egresos || evento.egresos || [];
    const ingresos = evento.Ingresos || evento.ingresos || [];

    const esperado = {
      nombreEvento: evento.nombreevento || evento.nombreEvento,
      lugarEvento: evento.lugarevento || evento.lugarEvento,
      fechaEvento: evento.fechaevento || evento.fechaEvento,
      horaEvento: evento.horaevento || evento.horaEvento,
      responsable: evento.responsable_evento || evento.responsable || null,
      participacionEsperada: primerResultado.participacion_esperada || null,
      satisfaccionEsperada: primerResultado.satisfaccion_esperada || null,
      otrosResultadosEsperados: primerResultado.otros_resultados || null,
      egresosEsperados: egresos,
      ingresosEsperados: ingresos,
      totalEgresosEsperado: Number(presupuesto.total_egresos || presupuesto.totalEgresos || 0),
      totalIngresosEsperado: Number(presupuesto.total_ingresos || presupuesto.totalIngresos || 0),
      balanceEsperado: Number(presupuesto.balance || 0),
    };

    return res.json({ esperado, informe });
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en getInformeEvento:', error);
    return res.status(500).json({ 
      message: 'Error interno al obtener el informe', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error del servidor' 
    });
  }
};

// POST /eventos/:id/informe
const guardarInformeEvento = async (req, res) => {
  try {
    const { InformeEvento, Evento } = getModels();

    const idevento = Number(req.params.id);
    if (isNaN(idevento)) {
      return res.status(400).json({ message: 'ID de evento inválido' });
    }

    const evento = await Evento.findByPk(idevento);
    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const puedeEditar = await esResponsableDelEvento(evento, req.user);
    if (!puedeEditar) {
      console.warn(`⚠️ Intento de edición no autorizada por usuario ID: ${req.user?.id} en evento ${idevento}`);
      return res.status(403).json({ message: 'No tienes permiso para completar el informe de este evento' });
    }

    const {
      segmento_alcanzado_estudiantes, segmento_alcanzado_docentes,
      segmento_alcanzado_publico_externo, segmento_alcanzado_influencers,
      segmento_alcanzado_otro_cual, segmento_alcanzado_otro_cantidad,
      objetivo_alcanzado_modelo_pedagogico, objetivo_alcanzado_posicionamiento,
      objetivo_alcanzado_internacionalizacion, objetivo_alcanzado_rsu,
      objetivo_alcanzado_fidelizacion, objetivo_alcanzado_otro_cual,
      participacion_real, indice_satisfaccion_real, otros_resultados_real,
      egresos_reales, ingresos_reales, info_prensa, analisis_desviaciones,
      lecciones_aprendidas, estado
    } = req.body;

    const egresosArr = Array.isArray(egresos_reales) ? egresos_reales : [];
    const ingresosArr = Array.isArray(ingresos_reales) ? ingresos_reales : [];
    
    const totalEgresosReal = egresosArr.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
    const totalIngresosReal = ingresosArr.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const balanceReal = totalIngresosReal - totalEgresosReal;

    const datosInforme = {
      idevento,
      segmento_alcanzado_estudiantes: Number(segmento_alcanzado_estudiantes) || 0,
      segmento_alcanzado_docentes: Number(segmento_alcanzado_docentes) || 0,
      segmento_alcanzado_publico_externo: Number(segmento_alcanzado_publico_externo) || 0,
      segmento_alcanzado_influencers: Number(segmento_alcanzado_influencers) || 0,
      segmento_alcanzado_otro_cual: segmento_alcanzado_otro_cual || null,
      segmento_alcanzado_otro_cantidad: Number(segmento_alcanzado_otro_cantidad) || 0,
      objetivo_alcanzado_modelo_pedagogico: !!objetivo_alcanzado_modelo_pedagogico,
      objetivo_alcanzado_posicionamiento: !!objetivo_alcanzado_posicionamiento,
      objetivo_alcanzado_internacionalizacion: !!objetivo_alcanzado_internacionalizacion,
      objetivo_alcanzado_rsu: !!objetivo_alcanzado_rsu,
      objetivo_alcanzado_fidelizacion: !!objetivo_alcanzado_fidelizacion,
      objetivo_alcanzado_otro_cual: objetivo_alcanzado_otro_cual || null,
      participacion_real: participacion_real || null,
      indice_satisfaccion_real: indice_satisfaccion_real || null,
      otros_resultados_real: otros_resultados_real || null,
      egresos_reales: egresosArr,
      ingresos_reales: ingresosArr,
      total_egresos_real: totalEgresosReal,
      total_ingresos_real: totalIngresosReal,
      balance_real: balanceReal,
      info_prensa: info_prensa || null,
      analisis_desviaciones: analisis_desviaciones || null,
      lecciones_aprendidas: lecciones_aprendidas || null,
      idusuario_responsable: req.user.id,
      estado: estado === 'finalizado' ? 'finalizado' : 'borrador',
    };

    // REEMPLAZO SEGURO DE UPSERT: findOrCreate + update
    // Esto evita errores de PostgreSQL con upsert cuando no hay constraints únicos perfectos
    const [informe, creado] = await InformeEvento.findOrCreate({
      where: { idevento },
      defaults: datosInforme
    });

    if (!creado) {
      await informe.update(datosInforme);
    }

    return res.json({ 
      message: creado ? 'Informe creado correctamente' : 'Informe actualizado correctamente', 
      informe 
    });
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en guardarInformeEvento:', error);
    return res.status(500).json({ 
      message: 'Error interno al guardar el informe', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error del servidor' 
    });
  }
};

module.exports = { getInformeEvento, guardarInformeEvento };