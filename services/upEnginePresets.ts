import { SavedProcessEntry } from '../types/upEngine';

export const INITIAL_PRESETS: SavedProcessEntry[] = [
  {
    id: 'proc_gestion_de_abastecimiento_y_logistica_de_bodega',
    savedAt: new Date().toLocaleString('es-CL'),
    process: {
      id: 'proc_gestion_bodega',
      name: 'Gestión de Abastecimiento y Logística de Bodega',
      description: 'Modelo normativo estandarizado de recepción, almacenamiento, trazabilidad de insumos y distribución hospitalaria.',
      version: '2.4.0',
      lastUpdated: new Date().toISOString().split('T')[0],
      asIsContext: 'Proceso manual basado en guías impresas en papel con retrasos de digitación de hasta 48 horas y pérdida recurrente de trazabilidad en insumos térmicos.',
      toBeOptimizations: 'Digitalización con escaneo QR/RFID, validación automática de rango de temperatura vía sensores IoT y actualización instantánea en ERP Central.',
      fceFactors: [
        'Capacitación continua del personal de bodega en cadena de frío',
        'Trazabilidad digital en tiempo real mediante QR/RFID',
        'Integración síncrona sin costuras con ERP / WMS Central',
        'Control estricto de accesos a zonas de alta criticidad'
      ],
      stages: [
        {
          id: 'stg_1',
          number: 1,
          name: 'Recepción y Verificación Física',
          description: 'Inspección de guías de despacho, certificación de cantidades y control de calidad térmico.',
          responsibleRole: 'Jefe de Bodega / Inspector Sanitario',
          substeps: [
            'Validación de orden de compra en sistema ERP',
            'Inspección física y control de temperatura de insumos termolábiles',
            'Firma de guía de despacho con observaciones técnicas'
          ],
          criticalControlPoints: ['Control de cadena de frío entre 2°C y 8°C'],
          estimatedTimeMinutes: 30,
          failureImpact: 'CRITICAL'
        },
        {
          id: 'stg_2',
          number: 2,
          name: 'Registro e Inventario Automatizado',
          description: 'Lectura de códigos de barra/QR, asignación de número de lote y fecha de vencimiento en ERP.',
          responsibleRole: 'Analista de Bodega',
          substeps: [
            'Escaneo de etiqueta máster e identificación de lote',
            'Sincronización síncrona con base de datos de inventario',
            'Generación de código único de ubicación física'
          ],
          criticalControlPoints: ['Verificación de coincidencia de lote y caducidad > 180 días'],
          estimatedTimeMinutes: 15,
          failureImpact: 'HIGH'
        },
        {
          id: 'stg_3',
          number: 3,
          name: 'Almacenamiento en Zona Clasificada',
          description: 'Ubicación física del insumo en estantería o cámara frigorífica según categoría de riesgo.',
          responsibleRole: 'Operador Logístico',
          substeps: [
            'Traslado seguro mediante equipos de transporte calibrados',
            'Ubicación en celda o refrigerador asignado',
            'Confirmación de ubicación vía terminal portátil'
          ],
          criticalControlPoints: ['Segregación de productos según matriz de incompatibilidad química y temperatura'],
          estimatedTimeMinutes: 20,
          failureImpact: 'HIGH'
        },
        {
          id: 'stg_4',
          number: 4,
          name: 'Despacho y Distribución Interna',
          description: 'Preparación de pedidos por servicio solicitante y despacho bajo norma de transporte seguro.',
          responsibleRole: 'Encargado de Distribución',
          substeps: [
            'Verificación de solicitud de abastecimiento aprobada',
            'Empaque en contenedores térmicos con registrador de datos',
            'Entrega y firma digital de recepción en servicio clínico'
          ],
          criticalControlPoints: ['Validación de firma digital del receptor autorizado antes del traspaso'],
          estimatedTimeMinutes: 25,
          failureImpact: 'CRITICAL'
        }
      ],
      governanceRules: [
        {
          id: 'gov_1',
          code: 'NORM-LOG-01',
          title: 'Verificación OBLIGATORIA de Cadena de Frío',
          description: 'Todo insumo termolábil debe contar con registro de temperatura comprobable antes de ingresar a almacén central.',
          severity: 'CRITICAL',
          enforcementType: 'BLOCKING'
        },
        {
          id: 'gov_2',
          code: 'NORM-LOG-02',
          title: 'Trazabilidad de Lotes y Expiración',
          description: 'No se permite el ingreso de insumos con vencimiento inferior a 180 días salvo autorización expresa de Farmacia.',
          severity: 'HIGH',
          enforcementType: 'BLOCKING'
        },
        {
          id: 'gov_3',
          code: 'NORM-LOG-03',
          title: 'Auditoría Muestra Aleatoria Diaria',
          description: 'Inspección física diaria de al menos 5% del stock de alta rotación para concordancia física vs sistémica.',
          severity: 'MEDIUM',
          enforcementType: 'WARNING'
        }
      ],
      roles: [
        {
          id: 'role_1',
          name: 'Jefe de Bodega',
          responsibilities: [
            'Supervisar la recepción e inspección física',
            'Validar firmas y observaciones en guías de despacho',
            'Aprobar desviaciones extraordinarias'
          ]
        },
        {
          id: 'role_2',
          name: 'Inspector Sanitario',
          responsibilities: [
            'Certificar condiciones térmicas e higiénicas',
            'Emitir actas de rechazo por rotura de cadena de frío'
          ]
        },
        {
          id: 'role_3',
          name: 'Analista de Bodega',
          responsibilities: [
            'Digitación y escaneo de lotes en ERP Central',
            'Mantener actualizado el catálogo de ubicaciones'
          ]
        }
      ],
      integrations: [
        {
          id: 'int_1',
          systemName: 'ERP / WMS Central',
          protocol: 'REST API / JSON',
          endpoint: '/api/v1/warehouse/receipts',
          authentication: 'Bearer JWT Token'
        },
        {
          id: 'int_2',
          systemName: 'Sistema IoT Sensores Temperatura',
          protocol: 'MQTT / WebSockets',
          endpoint: 'wss://iot.hospital.cl/coldchain',
          authentication: 'X.509 Certificate / API Key'
        }
      ]
    }
  },
  {
    id: 'proc_triage_clinico_y_atencion_en_urgencias',
    savedAt: new Date().toLocaleString('es-CL'),
    process: {
      id: 'proc_triage_urgencias',
      name: 'Triage Clínico y Atención en Urgencias',
      description: 'Modelo normativo asistencial para la categorización rápida de riesgo de pacientes y priorización de box de urgencia.',
      version: '3.1.0',
      lastUpdated: new Date().toISOString().split('T')[0],
      asIsContext: 'Categorización visual informal con variabilidad de criterio entre turnos y demoras no monitoreadas en pacientes ESI-2 / ESI-3.',
      toBeOptimizations: 'Algoritmo estandarizado ESI computarizado con toma automática de signos vitales e integración directa a Ficha Clínica Electrónica.',
      fceFactors: [
        'Disponibilidad permanente de enfermera entrenada en Triage ESI',
        'Integración en tiempo real con monitores multiparámetro',
        'Visualizador de tiempos de espera en sala de urgencias'
      ],
      stages: [
        {
          id: 'stg_1',
          number: 1,
          name: 'Admisión e Identificación de Paciente',
          description: 'Registro inicial de filiación, RUT, motivo de consulta y verificación de alergias severas.',
          responsibleRole: 'Admisionista de Urgencias',
          substeps: [
            'Búsqueda en padrón nacional / Ficha Clínica',
            'Verificación de brazalete de identificación',
            'Apertura de episodio de urgencias'
          ],
          criticalControlPoints: ['Confirmación de identidad y alerta de alergia crítica en sistema'],
          estimatedTimeMinutes: 5,
          failureImpact: 'HIGH'
        },
        {
          id: 'stg_2',
          number: 2,
          name: 'Categorización ESI / Triage Clínico',
          description: 'Evaluación rápida de signos vitales, escala de dolor y asignación de categoría ESI 1 al 5.',
          responsibleRole: 'Enfermera de Triage',
          substeps: [
            'Medición de FC, PA, SatO2, Temp y HGT',
            'Aplicación del algoritmo de decisiones ESI',
            'Asignación de categoría y pulsera de color'
          ],
          criticalControlPoints: ['Evaluación de riesgo vital inmediato (< 2 min para ESI-1)'],
          estimatedTimeMinutes: 10,
          failureImpact: 'CRITICAL'
        },
        {
          id: 'stg_3',
          number: 3,
          name: 'Asignación de Box y Reevaluación',
          description: 'Ubicación del paciente en sala de espera o ingreso directo a box de reanimación según ESI.',
          responsibleRole: 'Coordinador Clínico de Urgencias',
          substeps: [
            'Visualización de disponibilidad de boxes',
            'Monitoreo de tiempos de espera según categoría',
            'Reevaluación de signos vitales si supera tiempo límite'
          ],
          criticalControlPoints: ['Reevaluación obligatoria a los 30 min para ESI-3 en espera'],
          estimatedTimeMinutes: 15,
          failureImpact: 'HIGH'
        },
        {
          id: 'stg_4',
          number: 4,
          name: 'Atención Médica y Diagnóstico',
          description: 'Evaluación por médico urgencista, solicitud de exámenes de laboratorio/imagenología e indicación.',
          responsibleRole: 'Médico Urgencista',
          substeps: [
            'Examen físico e historia clínica enfocada',
            'Emisión de órdenes de laboratorio y medicamentos',
            'Determinación de destino (Alta / Hospitalización / Pabellón)'
          ],
          criticalControlPoints: ['Registro inmediato de indicación médica en Ficha Electrónica'],
          estimatedTimeMinutes: 45,
          failureImpact: 'CRITICAL'
        }
      ],
      governanceRules: [
        {
          id: 'gov_1',
          code: 'NORM-TRI-01',
          title: 'Atención Inmediata en ESI 1',
          description: 'Pacientes categorizados como ESI 1 (Riesgo vital) deben ingresar a Box de Reanimación en menos de 2 minutos.',
          severity: 'CRITICAL',
          enforcementType: 'BLOCKING'
        },
        {
          id: 'gov_2',
          code: 'NORM-TRI-02',
          title: 'Registro Obligatorio de Signos Vitales Completo',
          description: 'No se puede finalizar el Triage sin haber registrado al menos SatO2, Frecuencia Cardíaca y Presión Arterial.',
          severity: 'HIGH',
          enforcementType: 'BLOCKING'
        },
        {
          id: 'gov_3',
          code: 'NORM-TRI-03',
          title: 'Alerta por Tiempo Máximo de Espera Overdue',
          description: 'Generación de alerta acústica y visual en pantalla si paciente ESI 2 espera más de 15 minutos sin atención médica.',
          severity: 'HIGH',
          enforcementType: 'WARNING'
        }
      ],
      roles: [
        {
          id: 'role_1',
          name: 'Admisionista de Urgencias',
          responsibilities: [
            'Registro ágil de filiación del paciente',
            'Verificación de previsiones y datos de contacto'
          ]
        },
        {
          id: 'role_2',
          name: 'Enfermera de Triage',
          responsibilities: [
            'Evaluación clínica inicial y medición de constantes vitales',
            'Determinación estricta del nivel ESI'
          ]
        },
        {
          id: 'role_3',
          name: 'Médico Urgencista',
          responsibilities: [
            'Evaluación diagnóstica y tratamiento de urgencia',
            'Decisión de hospitalización o alta'
          ]
        }
      ],
      integrations: [
        {
          id: 'int_1',
          systemName: 'Ficha Clínica Electrónica (HIS)',
          protocol: 'HL7 FHIR v4',
          endpoint: '/fhir/Patient/$triage',
          authentication: 'OAuth2 Client Credentials'
        },
        {
          id: 'int_2',
          systemName: 'Sistema de Llamado de Pacientes Totem',
          protocol: 'REST API / JSON',
          endpoint: '/api/v2/totem/call',
          authentication: 'API Key'
        }
      ]
    }
  }
];
