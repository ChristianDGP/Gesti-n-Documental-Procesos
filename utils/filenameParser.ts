
import { ParsedFilenameResult } from '../types';

/**
 * Parsea y valida el nombre de archivo según la norma institucional estricta.
 * Formato esperado: PROYECTO - Microproceso - TIPO - Versión
 * Ejemplo: HPC - Gestión de Proyectos - ASIS - v1.0
 * 
 * @param fullFilename Nombre completo del archivo (con extensión)
 * @param expectedProject (Opcional) Proyecto seleccionado en el formulario para validar consistencia
 * @param expectedMicro (Opcional) Microproceso seleccionado para validar consistencia
 * @param expectedType (Opcional) Tipo de informe seleccionado (AS IS, TO BE, etc)
 */
export const parseDocumentFilename = (
  fullFilename: string, 
  expectedProject?: string,
  expectedMicro?: string,
  expectedType?: string
): ParsedFilenameResult => {
  const result: ParsedFilenameResult = {
    valido: false,
    errores: []
  };

  // 1. Separar nombre de extensión
  const lastDotIndex = fullFilename.lastIndexOf('.');
  const filenameBase = lastDotIndex !== -1 ? fullFilename.substring(0, lastDotIndex) : fullFilename;
  
  // 2. Validar longitud máxima (55 caracteres) del nombre base
  if (filenameBase.length > 55) {
    result.errores.push(`El nombre del archivo (sin extensión) excede los 55 caracteres (actual: ${filenameBase.length}).`);
  }

  // 3. Validar Estructura General por separador " - "
  // Formato: [PROYECTO] - [MICROPROCESO] - [TIPO] - [VERSION]
  const parts = filenameBase.split(' - ');

  if (parts.length < 4) {
    result.errores.push('El formato es incorrecto. Debe ser: "PROYECTO - Microproceso - TIPO - Versión". Faltan separadores " - ".');
    return result;
  }

  // Asignar partes (El microproceso podría contener guiones, pero el separador es " - ")
  // Estrategia: 
  // index 0: Proyecto
  // index Last: Version
  // index Last-1: Tipo
  // index 1 to Last-2: Microproceso
  
  const proyecto = parts[0];
  const version = parts[parts.length - 1];
  const tipoCodigo = parts[parts.length - 2];
  
  // Reconstruir microproceso si se separó por error (aunque usamos ' - ' que es específico)
  const microproceso = parts.slice(1, parts.length - 2).join(' - ');

  // 4. Validar Proyecto
  if (proyecto !== 'HPC' && proyecto !== 'HSR') {
    result.errores.push(`El proyecto "${proyecto}" no es válido. Debe ser "HPC" o "HSR".`);
  } else if (expectedProject && proyecto !== expectedProject) {
    result.errores.push(`Inconsistencia: El archivo es del proyecto "${proyecto}" pero seleccionaste "${expectedProject}".`);
  }
  result.proyecto = proyecto as 'HPC' | 'HSR';

  // 5. Validar Microproceso
  if (!microproceso || microproceso.trim() === '') {
    result.errores.push('El nombre del microproceso no puede estar vacío.');
  } else if (expectedMicro && microproceso !== expectedMicro) {
    result.errores.push(`Inconsistencia: El archivo indica microproceso "${microproceso}" pero seleccionaste "${expectedMicro}".`);
  }
  result.microproceso = microproceso;

  // 6. Validar Tipo de Informe
  // Mapeo de UI a Filename
  // AS IS -> ASIS
  // TO BE -> TOBE
  // FCE -> FCE
  // PM -> PM
  const mapTypeToCode: Record<string, string> = {
      'AS IS': 'ASIS',
      'TO BE': 'TOBE',
      'FCE': 'FCE',
      'PM': 'PM'
  };

  // Validar si el código en el archivo es válido en general
  const validCodes = Object.values(mapTypeToCode);
  if (!validCodes.includes(tipoCodigo)) {
      result.errores.push(`El tipo de informe "${tipoCodigo}" no es válido. Debe ser: ASIS, TOBE, FCE o PM.`);
  }

  // Validar consistencia si se espera un tipo específico
  if (expectedType) {
      const expectedCode = mapTypeToCode[expectedType];
      if (tipoCodigo !== expectedCode) {
          result.errores.push(`Inconsistencia: El archivo es de tipo "${tipoCodigo}" pero seleccionaste "${expectedType}" (se esperaba "${expectedCode}").`);
      }
  }
  result.tipo = tipoCodigo;

  // 7. Analizar Versión (Nomenclatura)
  result.nomenclatura = version;
  let matchFound = false;

  // Regla 1: 0.0 (Iniciado)
  if (/^0\.0$/.test(version)) {
    result.estado = 'Iniciado';
    result.porcentaje = 10;
    result.explicacion = 'Versión inicial.';
    matchFound = true;
  }
  // Regla 2: 0.n (En proceso)
  else if (/^0\.[1-9]\d*$/.test(version)) {
    result.estado = 'En proceso';
    result.porcentaje = 30;
    matchFound = true;
  }
  // Regla 3: v0.n (En revisión interna)
  else if (/^v0\.\d+$/.test(version)) {
    result.estado = 'En revisión interna';
    result.porcentaje = 60;
    matchFound = true;
  }
  // Regla 4: v1.n (Enviado a referente)
  else if (/^v1\.\d+$/.test(version)) {
    result.estado = 'Enviado a Referente';
    result.porcentaje = 80;
    matchFound = true;
  }
  // Regla 5: v1.n.i (Revisión con referentes)
  else if (/^v1\.\d+\.\d+$/.test(version)) {
    result.estado = 'Revisión con referentes';
    result.porcentaje = 80;
    matchFound = true;
  }
  // Regla 6: v1.nAR (Enviado a Control de Gestión)
  else if (/^v1\.\d+AR$/.test(version)) {
    result.estado = 'Enviado a Control de Gestión';
    result.porcentaje = 90;
    matchFound = true;
  }
  // Regla 7: v1.n.iAR (Revisión con control de gestión)
  else if (/^v1\.\d+\.\d+AR$/.test(version)) {
    result.estado = 'Revisión con Control de Gestión';
    result.porcentaje = 90;
    matchFound = true;
  }
  // Regla 8: v1.nACG (Aprobado Control Gestión)
  else if (/^v1\.\d+ACG$/.test(version)) {
    result.estado = 'Aprobado Control Gestión';
    result.porcentaje = 100;
    matchFound = true;
  }

  if (!matchFound) {
    result.errores.push(`La versión "${version}" no cumple el formato estándar (ej: 0.0, 0.1, v1.0).`);
  }

  // Resultado final
  result.valido = result.errores.length === 0;
  return result;
};
