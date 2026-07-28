const { getModels } = require('../models/index.js');

async function esResponsableDelEvento(evento, usuario, models) {
  console.log('🔍 [esResponsableDelEvento] Verificando permisos...');
  
  if (!usuario) {
    console.log('   ❌ Denegado: No hay usuario en req.user');
    return false;
  }
  
  if (usuario.role === 'admin') {
    console.log('   ✅ Concedido: El usuario tiene rol de admin');
    return true;
  }
  
  const idacademicoDelEvento = evento.idacademico;
  console.log(`    idacademico del evento: ${idacademicoDelEvento}`);
  console.log(`   🆔 idusuario del usuario actual: ${usuario.idusuario || usuario.id}`);
  
  if (!idacademicoDelEvento) {
    console.log('   ❌ Denegado: El evento no tiene idacademico asignado');
    return false;
  }
  
  const { Academico } = models;
  const registroAcademico = await Academico.findOne({
    where: { idacademico: idacademicoDelEvento }
  });
  
  if (!registroAcademico) {
    console.log('   ❌ Denegado: No se encontró el registro en tabla academico');
    return false;
  }
  
  console.log(`   🔗 idusuario vinculado a ese idacademico: ${registroAcademico.idusuario}`);
  
  const userIdActual = usuario.idusuario || usuario.id;
  if (registroAcademico.idusuario && Number(registroAcademico.idusuario) === Number(userIdActual)) {
    console.log('   ✅ Concedido: El usuario es el responsable del evento');
    return true;
  }
  
  console.log(`   ❌ Denegado: El usuario NO es el responsable`);
  return false;
}

const getInformeEvento = async (req, res) => {
  console.log('🔍 [getInformeEvento] Iniciando para evento ID:', req.params.id);
  try {
    const models = getModels();
    const { InformeEvento, Evento, Resultado } = models;
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
      if (!informe) {
        console.log('⚠️ No existe informe aún, se devolverá null');
      }
    } catch (informeError) {
      console.warn('⚠️ Error buscando informe:', informeError.message);
      informe = null;
    }

    // 2. OBTENER LOS DATOS DE LA TABLA RESULTADO (incluyendo los 3 campos nuevos)
    let resultado;
    try {
      resultado = await Resultado.findOne({ where: { idevento } });
      console.log('📊 Resultado encontrado:', resultado ? 'SÍ' : 'NO');
      if (resultado) {
        console.log('   - info_prensa:', resultado.info_prensa);
        console.log('   - analisis_desviaciones:', resultado.analisis_desviaciones);
        console.log('   - lecciones_aprendidas:', resultado.lecciones_aprendidas);
      }
    } catch (resultadoError) {
      console.error('❌ Error buscando resultado:', resultadoError.message);
      resultado = null;
    }

    // 3. Obtener egresos, ingresos y presupuesto
    let egresos = [];
    let ingresos = [];
    let presupuesto = {};

    try {
      if (evento.getEgresos) egresos = await evento.getEgresos() || [];
      if (evento.getIngresos) ingresos = await evento.getIngresos() || [];
      if (evento.getPresupuesto) presupuesto = await evento.getPresupuesto() || {};
    } catch (assocError) {
      egresos = evento.Egresos || evento.egresos || [];
      ingresos = evento.Ingresos || evento.ingresos || [];
      presupuesto = evento.Presupuesto || evento.presupuesto || {};
    }

    const esperado = {
      nombreEvento: evento.nombreevento || evento.nombreEvento,
      lugarEvento: evento.lugarevento || evento.lugarEvento,
      fechaEvento: evento.fechaevento || evento.fechaEvento,
      horaEvento: evento.horaevento || evento.horaEvento,
      responsable: evento.responsable_evento || evento.responsable || null,
      participacionEsperada: resultado?.participacion_esperada || null,
      satisfaccionEsperada: resultado?.satisfaccion_esperada || null,
      otrosResultadosEsperados: resultado?.otros_resultados || null,
      egresosEsperados: egresos,
      ingresosEsperados: ingresos,
      totalEgresosEsperado: Number(presupuesto?.total_egresos || presupuesto?.totalEgresos || 0),
      totalIngresosEsperado: Number(presupuesto?.total_ingresos || presupuesto?.totalIngresos || 0),
      balanceEsperado: Number(presupuesto?.balance || 0),
    };

    // 4. SI EXISTE RESULTADO, AGREGAR LOS 3 CAMPOS AL OBJETO INFORME
    if (resultado) {
      if (!informe) {
        // Si no hay informe pero sí resultado, creamos un objeto vacío
        informe = {
          info_prensa: resultado.info_prensa || null,
          analisis_desviaciones: resultado.analisis_desviaciones || null,
          lecciones_aprendidas: resultado.lecciones_aprendidas || null,
        };
      } else {
        // Si existe informe, agregamos los campos
        informe.info_prensa = resultado.info_prensa || null;
        informe.analisis_desviaciones = resultado.analisis_desviaciones || null;
        informe.lecciones_aprendidas = resultado.lecciones_aprendidas || null;
      }
    }

    console.log('✅ [getInformeEvento] Respuesta enviada con éxito');
    console.log('   - informe.info_prensa:', informe?.info_prensa);
    console.log('   - informe.analisis_desviaciones:', informe?.analisis_desviaciones);
    console.log('   - informe.lecciones_aprendidas:', informe?.lecciones_aprendidas);
    
    return res.json({ esperado, informe });
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en getInformeEvento:', error.message);
    console.error('Stack:', error.stack);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

// POST /eventos/:id/informe
const guardarInformeEvento = async (req, res) => {
  console.log('💾 [guardarInformeEvento] Iniciando guardado para evento ID:', req.params.id);
  try {
    const models = getModels();
    const { Evento, Resultado } = models;
    const idevento = Number(req.params.id);
    
    if (isNaN(idevento)) {
      return res.status(400).json({ message: 'ID de evento inválido' });
    }

    const evento = await Evento.findByPk(idevento);
    if (!evento) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    // Verificar permisos
    const puedeEditar = await esResponsableDelEvento(evento, req.user, models);
    if (!puedeEditar) {
      return res.status(403).json({ 
        message: 'No tienes permiso para completar el informe. Solo el responsable o admin pueden hacerlo.' 
      });
    }

    // Extraer datos del body
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

    // Datos a guardar en la tabla resultado
    const datosResultado = {
      idevento,
      // Segmentos alcanzados (los guardamos como JSON en otros_resultados_real si no hay columna específica)
      participacion_real: participacion_real || null,
      satisfaccion_real: indice_satisfaccion_real || null,
      otros_resultados_real: otros_resultados_real || null,
      // NUEVOS CAMPOS
      info_prensa: info_prensa || null,
      analisis_desviaciones: analisis_desviaciones || null,
      lecciones_aprendidas: lecciones_aprendidas || null,
      estado: estado === 'finalizado' ? 'finalizado' : 'borrador',
    };

    // Buscar si ya existe un resultado para este evento
    let resultado = await Resultado.findOne({ where: { idevento } });
    let creado = false;

    if (!resultado) {
      // Crear nuevo registro
      resultado = await Resultado.create(datosResultado);
      creado = true;
      console.log('✅ Resultado creado nuevo');
    } else {
      // Actualizar registro existente
      await resultado.update(datosResultado);
      console.log('✅ Resultado actualizado');
    }

    return res.json({ 
      message: creado ? 'Informe creado correctamente' : 'Informe actualizado correctamente', 
      informe: resultado 
    });
  } catch (error) {
    console.error('❌ ERROR en guardarInformeEvento:', error.message);
    console.error('Stack:', error.stack);
    return res.status(500).json({ 
      message: 'Error interno al guardar el informe', 
      error: error.message 
    });
  }
};

module.exports = { getInformeEvento, guardarInformeEvento };