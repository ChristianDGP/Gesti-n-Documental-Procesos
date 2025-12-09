
import { ParsedFilenameResult } from '../types';

/**
 * Parsea y valida el nombre de archivo según la norma institucional estricta.
 * Formato esperado: PROYECTO - Microproceso - TIPO - Versión
 * Ejemplo: HPC - Gestión de Proyectos - ASIS - v1.0
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
  
  // 2. Validar longitud máxima (55 caracteres)
  if (filenameBase.length > 55) {
    result.errores.push(`El nombre del archivo excede 55 caracteres.`);
  }

  // 3. Validar Estructura General
  const parts = filenameBase.split(' - ');

  if (parts.length < 4) {
    result.errores.push('Formato incorrecto. Use: "PROYECTO - Microproceso - TIPO - Versión".');
    return result;
  }

  const proyecto = parts[0];
  const version = parts[parts.length - 1];
  const tipoCodigo = parts[parts.length - 2];
  const microproceso = parts.slice(1, parts.length - 2).join(' - ');

  // 4. Validar Proyecto
  if (proyecto !== 'HPC' && proyecto !== 'HSR') {
    result.errores.push(`Proyecto inválido: ${proyecto}.`);
  } else if (expectedProject && proyecto !== expectedProject) {
    result.errores.push(`Proyecto no coincide con la solicitud.`);
  }
  result.proyecto = proyecto as 'HPC' | 'HSR';

  // 5. Validar Microproceso
  if (!microproceso || microproceso.trim() === '') {
    result.errores.push('Microproceso vacío.');
  } else if (expectedMicro && microproceso !== expectedMicro) {
    result.errores.push(`Microproceso no coincide.`);
  }
  result.microproceso = microproceso;

  // 6. Validar Tipo
  const mapTypeToCode: Record<string, string> = {
      'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM'
  };
  const validCodes = Object.values(mapTypeToCode);
  if (!validCodes.includes(tipoCodigo)) {
      result.errores.push(`Tipo inválido: ${tipoCodigo}.`);
  }
  if (expectedType) {
      const expectedCode = mapTypeToCode[expectedType];
      if (tipoCodigo !== expectedCode) {
          result.errores.push(`Tipo no coincide con la solicitud.`);
      }
  }
  result.tipo = tipoCodigo;

  // 7. Analizar Versión
  result.nomenclatura = version;
  if (/^v?\d+(\.\d+)*([A-Z]+)?$/.test(version)) {
      // Basic syntax check pass
  } else {
    result.errores.push(`Formato de versión inválido: ${version}`);
  }

  // Logic map for state detection (CORRECTED)
  if (result.errores.length === 0) {
      // Logic for creating requests / inferring state based on filename suffixes
      if (version.endsWith('ACG')) {
          result.estado = 'Aprobado';
          result.porcentaje = 100;
      } else if (version.endsWith('AR')) {
          result.estado = 'Enviado a Control de Gestión'; // v1.nAR
          result.porcentaje = 90;
      } else if (version.startsWith('v1.') && !version.includes('AR')) {
          result.estado = 'Enviado a Referente'; 
          result.porcentaje = 80;
      } else if (version.startsWith('v0.')) {
          result.estado = 'En revisión interna'; 
          result.porcentaje = 60;
      } else {
          result.estado = 'En Proceso'; 
          result.porcentaje = 30;
      }
  }

  result.valido = result.errores.length === 0;
  return result;
};

/**
 * Valida las reglas de transición de versiones.
 * Se ha simplificado para priorizar la validación de formato y dejar que la lógica de estado (Backend) 
 * decida el destino basado en el sufijo (ACG, AR, etc).
 */
export const checkVersionRules = (currentVersion: string, newVersion: string, action: 'REQUEST' | 'APPROVE' | 'REJECT'): { valid: boolean; error?: string } => {
    
    // Si no hay nueva versión (ej: request sin cambio de archivo), pasar.
    if (!newVersion) return { valid: true };

    const cur = currentVersion.trim();
    const nev = newVersion.trim();

    if (cur === nev) {
        return { valid: false, error: 'La nueva versión debe ser diferente a la actual.' };
    }

    // Reglas de formato básicas
    if (action === 'APPROVE') {
        // Para aprobar, generalmente esperamos un avance de versión o un sufijo
        // Validamos simplemente que sea un formato válido, el backend decide el estado.
        return { valid: true };
    }

    if (action === 'REJECT') {
        // Para rechazar, se sube una nueva versión (con comentarios) pero el estado retrocede.
        return { valid: true };
    }

    return { valid: true }; 
};
