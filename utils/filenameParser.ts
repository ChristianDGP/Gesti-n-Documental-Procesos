
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
  expectedType?: string,
  expectedRequestType?: 'INTERNAL' | 'REFERENT' | 'CONTROL'
): ParsedFilenameResult => {
  const result: ParsedFilenameResult = {
    valido: false,
    errores: []
  };

  // 1. Separar nombre de extensión
  const lastDotIndex = fullFilename.lastIndexOf('.');
  const filenameBase = lastDotIndex !== -1 ? fullFilename.substring(0, lastDotIndex) : fullFilename;
  
  // 2. Validar longitud máxima (80 caracteres)
  if (filenameBase.length > 80) {
    result.errores.push(`El nombre del archivo excede 80 caracteres.`);
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

  // 7. Analizar Versión y Reglas de Solicitud (Paridad)
  result.nomenclatura = version;

  // Regex básicos
  const regexInternal = /^v0\.(\d+)$/;          // v0.n
  const regexReferent = /^v1\.(\d+)\.(\d+)$/;   // v1.n.i
  const regexControl = /^v1\.(\d+)\.(\d+)AR$/;  // v1.n.iAR
  const regexStandard = /^v?\d+(\.\d+)*([A-Z]+)?$/;

  if (expectedRequestType) {
      if (expectedRequestType === 'INTERNAL') {
          const match = version.match(regexInternal);
          if (!match) {
              result.errores.push('Para Revisión Interna el formato debe ser "v0.n" (ej: v0.1).');
          } else {
              const n = parseInt(match[1]);
              if (n % 2 === 0) {
                  result.errores.push(`Para Revisión Interna el dígito "n" (${n}) debe ser IMPAR (ej: v0.1, v0.3).`);
              }
          }
      } else if (expectedRequestType === 'REFERENT') {
          const match = version.match(regexReferent);
          if (!match) {
              result.errores.push('Para Revisión Referente el formato debe ser "v1.n.i" (ej: v1.0.1).');
          } else {
              const i = parseInt(match[2]);
              if (i % 2 === 0) {
                  result.errores.push(`Para Revisión Referente el dígito "i" (${i}) debe ser IMPAR (ej: v1.0.1, v1.0.3).`);
              }
          }
      } else if (expectedRequestType === 'CONTROL') {
          const match = version.match(regexControl);
          if (!match) {
              result.errores.push('Para Control de Gestión el formato debe ser "v1.n.iAR" (ej: v1.0.1AR).');
          } else {
              const i = parseInt(match[2]);
              if (i % 2 === 0) {
                  result.errores.push(`Para Control de Gestión el dígito "i" (${i}) debe ser IMPAR (ej: v1.0.1AR).`);
              }
          }
      }
  } else {
      // Validación genérica si no hay tipo de solicitud explícito
      if (!regexStandard.test(version)) {
          result.errores.push(`Formato de versión inválido: ${version}`);
      }
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
      } else if (version.startsWith('v1.') && !version.includes('AR') && (version.split('.').length > 2)) {
          // v1.n.i -> Revisión Referente (Flujo activo)
          result.estado = 'Revisión con referentes';
          result.porcentaje = 80;
      } else if (version.startsWith('v1.') && !version.includes('AR')) {
          // v1.n -> Enviado a Referente (o aprobado v1.0)
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
