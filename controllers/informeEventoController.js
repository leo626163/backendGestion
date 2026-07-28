const { getModels } = require('../models/index.js');

async function esResponsableDelEvento(evento, usuario, models) {
  console.log('🔍 [esResponsableDelEvento] Verificando permisos...');
  console.log('   👤 Usuario:', usuario ? { id: usuario.idusuario, role: usuario.role } : 'NO DEFINIDO');
  
  if (!usuario) {
    console.log('   ❌ Denegado: No hay usuario en req.user');
    return false;
  }
  
  if (usuario.role === 'admin') {
    console.log('   ✅ Concedido: El usuario tiene rol de admin');
    return true;
  }
  
  const idacademicoDelEvento = evento.idacademico;
  console.log(`   📌 idacademico del evento: ${idacademicoDelEvento}`);
  console.log(`   🆔 idusuario del usuario actual: ${usuario.idusuario}`);
  
  if (!idacademicoDelEvento) {
    console.log('   ❌ Denegado: El evento no tiene idacademico asignado');
    return false;
  }
  
  // Buscamos el registro en la tabla Academico para ver si coincide
  const { Academico } = models;
  const registroAcademico = await Academico.findOne({
    where: { idacademico: idacademicoDelEvento }
  });
  
  if (!registroAcademico) {
    console.log('   ❌ Denegado: No se encontró el registro en tabla academico');
    return false;
  }
  
  console.log(`   🔗 idusuario vinculado a ese idacademico: ${registroAcademico.idusuario}`);
  
  // Comparamos: el idusuario del token vs el idusuario vinculado al academico
  if (registroAcademico.idusuario && Number(registroAcademico.idusuario) === Number(usuario.idusuario)) {
    console.log('   ✅ Concedido: El usuario es el responsable del evento');
    return true;
  }
  
  console.log(`   ❌ Denegado: El usuario NO es el responsable`);
  return false;
}

// GET /eventos/:id/informe
const getInformeEvento = async (req, res) => {
  console.log('🔍 [getInformeEvento] Iniciando para evento ID:', req.params.id);
  try {
    let models;
    try {
      models = getModels();
    } catch (modelError) {
      console.error('❌ Error cargando modelos:', modelError.message);
      return res.status(500).json({ message: 'Error cargando modelos', error: modelError.message });
    }

    const { InformeEvento, Evento } = models;
    const idevento = Number(req.params.id);
    
    if (isNaN(idevento)) {
      return res.status(400).json({ message: 'ID de evento inválido' });
    }

    let evento;
    try {
      evento = await Evento.findByPk(idevento);
    } catch (findError) {
      console.error('❌ Error en findByPk:', findError.message);
      return res.status(500).json({ message: 'Error buscando evento', error: findError.message });
    }

    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    let informe;
    try {
      informe = await InformeEvento.findOne({ where: { idevento } });
    } catch (informeError) {
      console.warn('⚠️ Error buscando informe:', informeError.message);
      informe = null;
    }

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

    return res.json({ esperado, informe });
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en getInformeEvento:', error.message);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

const guardarInformeEvento = async (req, res) => {
  console.log(' [guardarInformeEvento] Iniciando guardado para evento ID:', req.params.id);
  try {
    const models = getModels();
    const { InformeEvento, Evento } = models;
    const idevento = Number(req.params.id);
    
    if (isNaN(idevento)) return res.status(400).json({ message: 'ID de evento inválido' });

    const evento = await Evento.findByPk(idevento);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });

    // PASAMOS LOS MODELOS A LA FUNCIÓN
    const puedeEditar = await esResponsableDelEvento(evento, req.user, models);
    if (!puedeEditar) {
      return res.status(403).json({ message: 'No tienes permiso para completar el informe. Solo el responsable o admin pueden hacerlo.' });
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
    console.error('❌ ERROR CRÍTICO en guardarInformeEvento:', error.message);
    return res.status(500).json({ message: 'Error interno al guardar', error: error.message });
  }
};

module.exports = { getInformeEvento, guardarInformeEvento };