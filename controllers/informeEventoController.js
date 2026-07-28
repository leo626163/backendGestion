const { getModels } = require('../models/index.js');

async function esResponsableDelEvento(evento, usuario) {
  if (!usuario) return false;
  if (usuario.role === 'admin') return true;
  if (evento.idusuario_responsable && evento.idusuario_responsable === usuario.id) return true;
  return false;
}

// GET /eventos/:id/informe
const getInformeEvento = async (req, res) => {
  try {
    const { InformeEvento, Evento, Resultados, Egresos, Ingresos, Presupuesto } = getModels();

    const idevento = Number(req.params.id);
    if (isNaN(idevento)) {
      return res.status(400).json({ message: 'ID de evento inválido' });
    }

    const evento = await Evento.findByPk(idevento, {
      include: [
        { model: Resultados },
        { model: Egresos },
        { model: Ingresos },
        { model: Presupuesto },
      ],
    });

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    let informe = await InformeEvento.findOne({ where: { idevento } });
    if (!informe) {
      // No existe todavía: se devuelve null para que el frontend sepa que es la primera vez
      informe = null;
    }

    // Datos "esperados", ya existentes en el evento (solo lectura para el usuario)
    const esperado = {
      nombreEvento: evento.nombreevento,
      lugarEvento: evento.lugarevento,
      fechaEvento: evento.fechaevento,
      horaEvento: evento.horaevento,
      responsable: evento.responsable_evento || null,
      participacionEsperada: evento.Resultados?.[0]?.participacion_esperada || null,
      satisfaccionEsperada: evento.Resultados?.[0]?.satisfaccion_esperada || null,
      otrosResultadosEsperados: evento.Resultados?.[0]?.otros_resultados || null,
      egresosEsperados: evento.Egresos || [],
      ingresosEsperados: evento.Ingresos || [],
      totalEgresosEsperado: evento.Presupuesto?.total_egresos || 0,
      totalIngresosEsperado: evento.Presupuesto?.total_ingresos || 0,
      balanceEsperado: evento.Presupuesto?.balance || 0,
    };

    return res.json({ esperado, informe });
  } catch (error) {
    console.error('Error al obtener informe de evento:', error);
    return res.status(500).json({ message: 'Error al obtener informe de evento', error: error.message });
  }
};

// POST /eventos/:id/informe  (upsert)
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
      return res.status(403).json({ message: 'No tienes permiso para completar el informe de este evento' });
    }

    const {
      segmento_alcanzado_estudiantes,
      segmento_alcanzado_docentes,
      segmento_alcanzado_publico_externo,
      segmento_alcanzado_influencers,
      segmento_alcanzado_otro_cual,
      segmento_alcanzado_otro_cantidad,
      objetivo_alcanzado_modelo_pedagogico,
      objetivo_alcanzado_posicionamiento,
      objetivo_alcanzado_internacionalizacion,
      objetivo_alcanzado_rsu,
      objetivo_alcanzado_fidelizacion,
      objetivo_alcanzado_otro_cual,
      participacion_real,
      indice_satisfaccion_real,
      otros_resultados_real,
      egresos_reales,
      ingresos_reales,
      info_prensa,
      analisis_desviaciones,
      lecciones_aprendidas,
      estado,
    } = req.body;

    const egresosArr = Array.isArray(egresos_reales) ? egresos_reales : [];
    const ingresosArr = Array.isArray(ingresos_reales) ? ingresos_reales : [];
    const totalEgresosReal = egresosArr.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
    const totalIngresosReal = ingresosArr.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const balanceReal = totalIngresosReal - totalEgresosReal;

    const [informe] = await InformeEvento.upsert({
      idevento,
      segmento_alcanzado_estudiantes: segmento_alcanzado_estudiantes || 0,
      segmento_alcanzado_docentes: segmento_alcanzado_docentes || 0,
      segmento_alcanzado_publico_externo: segmento_alcanzado_publico_externo || 0,
      segmento_alcanzado_influencers: segmento_alcanzado_influencers || 0,
      segmento_alcanzado_otro_cual: segmento_alcanzado_otro_cual || null,
      segmento_alcanzado_otro_cantidad: segmento_alcanzado_otro_cantidad || 0,
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
    }, {
      returning: true,
    });

    return res.json({ message: 'Informe guardado correctamente', informe });
  } catch (error) {
    console.error('Error al guardar informe de evento:', error);
    return res.status(500).json({ message: 'Error al guardar informe de evento', error: error.message });
  }
};

module.exports = { getInformeEvento, guardarInformeEvento };