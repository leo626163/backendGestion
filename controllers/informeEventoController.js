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
  console.log('🔍 [getInformeEvento] Iniciando para evento ID:', req.params.id);
  console.log('👤 [getInformeEvento] Usuario en req.user:', req.user ? req.user.id : 'NO DEFINIDO');
  
  try {
    let models;
    try {
      models = getModels();
      console.log('✅ [getInformeEvento] Modelos cargados correctamente.');
    } catch (modelError) {
      console.error('❌ [getInformeEvento] Error cargando modelos:', modelError.message);
      return res.status(500).json({ message: 'Error cargando modelos de base de datos', error: modelError.message });
    }

    const { InformeEvento, Evento } = models;
    const idevento = Number(req.params.id);
    
    if (isNaN(idevento)) {
      console.warn('⚠️ [getInformeEvento] ID inválido:', req.params.id);
      return res.status(400).json({ message: 'ID de evento inválido' });
    }

    console.log('🔍 [getInformeEvento] Buscando evento en BD con ID:', idevento);
    let evento;
    try {
      // Buscamos SIN includes primero para evitar errores de asociaciones rotas
      evento = await Evento.findByPk(idevento);
      console.log('✅ [getInformeEvento] Evento encontrado:', evento ? 'SÍ' : 'NO');
    } catch (findError) {
      console.error('❌ [getInformeEvento] Error en findByPk:', findError.message);
      return res.status(500).json({ message: 'Error buscando evento', error: findError.message });
    }

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    // 2. Búsqueda del informe
    let informe;
    try {
      informe = await InformeEvento.findOne({ where: { idevento } });
      console.log('✅ [getInformeEvento] Informe existente:', informe ? 'SÍ' : 'NO (se devolverá null)');
    } catch (informeError) {
      console.error('⚠️ [getInformeEvento] Error buscando informe (se continuará como null):', informeError.message);
      informe = null;
    }

    // 3. Extracción defensiva de datos asociados
    let resultados = [];
    let presupuesto = {};
    let egresos = [];
    let ingresos = [];

    try {
      if (evento.getResultados) resultados = await evento.getResultados() || [];
      if (evento.getPresupuesto) presupuesto = await evento.getPresupuesto() || {};
      if (evento.getEgresos) egresos = await evento.getEgresos() || [];
      if (evento.getIngresos) ingresos = await evento.getIngresos() || [];
    } catch (assocError) {
      console.warn('⚠️ [getInformeEvento] Error cargando asociaciones, usando datos directos:', assocError.message);
      resultados = evento.Resultados || evento.resultados || [];
      presupuesto = evento.Presupuesto || evento.presupuesto || {};
      egresos = evento.Egresos || evento.egresos || [];
      ingresos = evento.Ingresos || evento.ingresos || [];
    }

    const primerResultado = Array.isArray(resultados) && resultados.length > 0 ? resultados[0] : {};
    
    const esperado = {
      nombreEvento: evento.nombreevento || evento.nombreEvento,
      lugarEvento: evento.lugarevento || evento.lugarEvento,
      fechaEvento: evento.fechaevento || evento.fechaEvento,
      horaEvento: evento.horaevento || evento.horaEvento,
      responsable: evento.responsable_evento || evento.responsable || null,
      participacionEsperada: primerResultado?.participacion_esperada || null,
      satisfaccionEsperada: primerResultado?.satisfaccion_esperada || null,
      otrosResultadosEsperados: primerResultado?.otros_resultados || null,
      egresosEsperados: egresos,
      ingresosEsperados: ingresos,
      totalEgresosEsperado: Number(presupuesto?.total_egresos || presupuesto?.totalEgresos || 0),
      totalIngresosEsperado: Number(presupuesto?.total_ingresos || presupuesto?.totalIngresos || 0),
      balanceEsperado: Number(presupuesto?.balance || 0),
    };

    console.log('✅ [getInformeEvento] Respuesta enviada con éxito al frontend.');
    return res.json({ esperado, informe });
    
  } catch (error) {
    console.error('❌ [getInformeEvento] ERROR CRÍTICO NO CAPTURADO:', error.message);
    console.error('📜 Stack trace:', error.stack);
    return res.status(500).json({ 
      message: 'Error interno al obtener el informe', 
      error: error.message 
    });
  }
};

// POST /eventos/:id/informe
const guardarInformeEvento = async (req, res) => {
  console.log('🔍 [guardarInformeEvento] Iniciando para evento ID:', req.params.id);
  try {
    const { InformeEvento, Evento } = getModels();
    const idevento = Number(req.params.id);
    
    if (isNaN(idevento)) return res.status(400).json({ message: 'ID de evento inválido' });

    const evento = await Evento.findByPk(idevento);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });

    const puedeEditar = await esResponsableDelEvento(evento, req.user);
    if (!puedeEditar) {
      console.warn(`⚠️ [guardarInformeEvento] Intento no autorizado por usuario ID: ${req.user?.id}`);
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

    const [informe, creado] = await InformeEvento.findOrCreate({
      where: { idevento },
      defaults: datosInforme
    });

    if (!creado) {
      await informe.update(datosInforme);
    }

    console.log('✅ [guardarInformeEvento] Guardado con éxito.');
    return res.json({ 
      message: creado ? 'Informe creado correctamente' : 'Informe actualizado correctamente', 
      informe 
    });
  } catch (error) {
    console.error('❌ [guardarInformeEvento] ERROR CRÍTICO:', error.message);
    return res.status(500).json({ message: 'Error interno al guardar el informe', error: error.message });
  }
};

module.exports = { getInformeEvento, guardarInformeEvento };