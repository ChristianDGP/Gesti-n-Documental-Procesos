
import { ParsedFilenameResult } from '../types';
import { DocState } from '../types';

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

  // 7. Analizar Versión y Reglas de Solicitud (Paridad) para ANALISTA (Solicitud)
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

  // Logic map for state detection
  if (result.errores.length === 0) {
      if (version.endsWith('ACG')) {
          result.estado = 'Aprobado';
          result.porcentaje = 100;
      } else if (version.endsWith('AR')) {
          result.estado = 'Enviado a Control de Gestión'; // v1.nAR
          result.porcentaje = 90;
      } else if (version.startsWith('v1.') && !version.includes('AR') && (version.split('.').length > 2)) {
          result.estado = 'Revisión con referentes';
          result.porcentaje = 80;
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
 * Valida las reglas de transición de versiones para el COORDINADOR (Aprobar/Rechazar).
 */
export const validateCoordinatorRules = (
    filename: string,
    currentVersion: string, 
    currentState: DocState,
    action: 'APPROVE' | 'REJECT'
): { valid: boolean; error?: string; hint?: string } => {
    
    // 1. Basic Parse to get nomenclature
    const parts = filename.replace(/\.[^/.]+$/, "").split(' - ');
    if (parts.length < 4) return { valid: false, error: 'Formato de nombre inválido.' };
    const newVersion = parts[parts.length - 1];

    // Helper Regex
    const regexInternal = /^v0\.(\d+)$/;          // v0.n
    const regexReferent = /^v1\.(\d+)\.(\d+)$/;   // v1.n.i
    const regexControl = /^v1\.(\d+)\.(\d+)AR$/;  // v1.n.iAR
    const regexApprovedInternal = /^v(\d+)\.0$/;   // v1.0
    const regexApprovedReferent = /^v1\.(\d+)$/;   // v1.n
    const regexApprovedControl = /^v1\.(\d+)AR$/;  // v1.nAR

    // --- RECHAZAR (Feedback Loop) ---
    if (action === 'REJECT') {
        if (currentState === DocState.INTERNAL_REVIEW) {
            // Caso A: v0.n -> n debe ser PAR
            const match = newVersion.match(regexInternal);
            if (!match) return { valid: false, error: 'Formato incorrecto. Para rechazar Revisión Interna use: v0.n' };
            const n = parseInt(match[1]);
            if (n % 2 !== 0) return { valid: false, error: `Para rechazar, "n" (${n}) debe ser PAR (ej: v0.2, v0.4).` };
            return { valid: true };
        }
        
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) {
             // Caso B: v1.n.i -> i debe ser PAR
             const match = newVersion.match(regexReferent);
             if (!match) return { valid: false, error: 'Formato incorrecto. Para rechazar Referente use: v1.n.i' };
             const i = parseInt(match[2]);
             if (i % 2 !== 0) return { valid: false, error: `Para rechazar, "i" (${i}) debe ser PAR (ej: v1.0.2).` };
             return { valid: true };
        }

        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) {
            // Caso C: v1.n.iAR -> i debe ser PAR
            const match = newVersion.match(regexControl);
            if (!match) return { valid: false, error: 'Formato incorrecto. Para rechazar Control use: v1.n.iAR' };
            const i = parseInt(match[2]);
             if (i % 2 !== 0) return { valid: false, error: `Para rechazar, "i" (${i}) debe ser PAR (ej: v1.0.2AR).` };
             return { valid: true };
        }
    }

    // --- APROBAR (Advance) ---
    if (action === 'APPROVE') {
        if (currentState === DocState.INTERNAL_REVIEW) {
            // Caso A: 0 incrementa en 1 (v0.x -> v1.0)
            const match = newVersion.match(regexApprovedInternal);
            if (!match) return { valid: false, error: 'Formato incorrecto. Para aprobar Interna debe ser v1.0, v2.0, etc.' };
            return { valid: true };
        }

        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) {
            // Caso B - Opción 1: v1.n (Consolidación / Incremento)
            const matchIncrement = newVersion.match(regexApprovedReferent);
            
            // Caso B - Opción 2: v1.nAR (Paso directo a Control)
            const matchControl = newVersion.match(regexApprovedControl);

            if (matchIncrement) return { valid: true };
            if (matchControl) return { valid: true };

            return { valid: false, error: 'Formato incorrecto. Opciones válidas: v1.n (Siguiente Versión) O v1.nAR (Paso a Control).' };
        }

        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) {
            // Caso C: v1.n.iAR -> n incrementa en 1, termina en AR
            // Example: v1.0.1AR -> v1.1AR
            const match = newVersion.match(regexApprovedControl);
            if (!match) return { valid: false, error: 'Formato incorrecto. Para aprobar Control debe ser v1.nAR (ej: v1.1AR).' };
            return { valid: true };
        }
    }

    // Fallback
    return { valid: true };
}

/**
 * Genera el texto de ayuda para el modal
 */
export const getCoordinatorRuleHint = (currentState: DocState, action: 'APPROVE' | 'REJECT'): string => {
    if (action === 'REJECT') {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v0.n (n es PAR). Ej: v0.2, v0.4';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Formato: v1.n.i (i es PAR). Ej: v1.0.2';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Formato: v1.n.iAR (i es PAR). Ej: v1.0.2AR';
    } else {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v1.0 (Incremento de entero)';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Opción 1: v1.n (Incremento) | Opción 2: v1.nAR (Paso a Control)';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Formato: v1.nAR (n incrementa). Ej: v1.1AR';
    }
    return 'Formato estándar';
};
