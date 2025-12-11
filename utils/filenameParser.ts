
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
  expectedRequestType?: 'INITIATED' | 'IN_PROCESS' | 'INTERNAL' | 'REFERENT' | 'CONTROL'
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

  // 7. Analizar Versión y Reglas de Solicitud
  result.nomenclatura = version;

  // Regex básicos
  const regexInitiated = /^0\.0$/;              // 0.0 (Estricto)
  const regexInProcess = /^0\.(\d+)$/;          // 0.n (Sin 'v', n > 0)
  const regexInternal = /^v0\.(\d+)$/;          // v0.n (Con 'v', impar)
  const regexReferent = /^v1\.(\d+)\.(\d+)$/;   // v1.n.i
  const regexControl = /^v1\.(\d+)\.(\d+)AR$/;  // v1.n.iAR
  const regexStandard = /^v?\d+(\.\d+)*([A-Z]+)?$/;

  if (expectedRequestType) {
      if (expectedRequestType === 'INITIATED') {
          if (!regexInitiated.test(version)) {
              result.errores.push('Para estado "Iniciado" la versión debe ser estrictamente "0.0".');
          }
      } else if (expectedRequestType === 'IN_PROCESS') {
          const match = version.match(regexInProcess);
          if (!match) {
              result.errores.push('Para "En Proceso" el formato debe ser "0.n" (ej: 0.1, 0.2) sin la letra "v".');
          } else {
               const n = parseInt(match[1]);
               if (n === 0) {
                   result.errores.push('La versión 0.0 corresponde a "Iniciado". Para "En Proceso" n debe ser mayor a 0 (ej: 0.1).');
               }
          }
      } else if (expectedRequestType === 'INTERNAL') {
          const match = version.match(regexInternal);
          if (!match) {
              result.errores.push('Para Revisión Interna el formato debe ser "v0.n" (con v).');
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
          // Intentamos ser permisivos con 0.0 y 0.n si no hay expectedType pero validamos formato general
          if (!regexInitiated.test(version) && !regexInProcess.test(version)) {
             result.errores.push(`Formato de versión inválido: ${version}`);
          }
      }
  }

  // Logic map for state detection (Auto-detect if not enforced)
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
      } else if (version === '0.0') {
          result.estado = 'Iniciado';
          result.porcentaje = 10;
      } else if (/^0\.\d+$/.test(version)) {
          result.estado = 'En Proceso';
          result.porcentaje = 30;
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
    
    // Approval Regexes (Strict)
    const regexApproveInterna = /^v1\.0$/; // A. v1.0 Strict
    
    // B. Referente Output: v1.n (consolidate) OR v1.nAR (control)
    const regexApproveReferentConsolidate = /^v1\.(\d+)$/; 
    const regexApproveReferentControl = /^v1\.(\d+)AR$/;

    // C. Control Output: v1.nACG (Finish)
    const regexApproveControlFinal = /^v1\.(\d+)ACG$/;

    // Extract 'n' from current version for logic checks
    let currentN = 0;
    // Try parse v0.n
    let matchN = currentVersion.match(/^v0\.(\d+)/);
    if (!matchN) matchN = currentVersion.match(/^v1\.(\d+)/);
    
    if (matchN) {
        currentN = parseInt(matchN[1]);
    }


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

    // --- APROBAR (Advance - Logic from User Prompt) ---
    if (action === 'APPROVE') {
        
        // A. Aprobación Revisión Interna
        if (currentState === DocState.INTERNAL_REVIEW) {
            // Regla: v1.0 Estricto
            if (!regexApproveInterna.test(newVersion)) {
                return { valid: false, error: 'Para aprobar Revisión Interna el archivo debe ser estrictamente "v1.0".' };
            }
            return { valid: true };
        }

        // B. Aprobación Referente
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) {
            // Opciones:
            // 1. Consolidar: v1.x (n avanza en 1 o se mantiene) - NOTA: Usualmente avanza al consolidar, pero permitimos ambos según prompt.
            // 2. Control: v1.xAR (n avanza en 1 o se mantiene)
            
            const matchConsolidate = newVersion.match(regexApproveReferentConsolidate);
            const matchControl = newVersion.match(regexApproveReferentControl);

            if (matchConsolidate) {
                const newN = parseInt(matchConsolidate[1]);
                if (newN < currentN) return { valid: false, error: `La versión v1.${newN} es inferior a la actual v1.${currentN}.` };
                return { valid: true };
            }

            if (matchControl) {
                const newN = parseInt(matchControl[1]);
                if (newN < currentN) return { valid: false, error: `La versión v1.${newN}AR es inferior a la actual v1.${currentN}.` };
                return { valid: true };
            }

            return { valid: false, error: 'Formato inválido. Use v1.n (Consolidar) o v1.nAR (Paso a Control).' };
        }

        // C. Aprobación Control Gestión
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) {
            // Opciones:
            // 1. Finalizar: v1.xACG (n avanza en 1 o se mantiene)
            
            const matchFinal = newVersion.match(regexApproveControlFinal);

            if (matchFinal) {
                const newN = parseInt(matchFinal[1]);
                if (newN < currentN) return { valid: false, error: `La versión v1.${newN}ACG es inferior a la actual v1.${currentN}AR.` };
                return { valid: true };
            }

            return { valid: false, error: 'Formato inválido. Para aprobar Control de Gestión use v1.nACG.' };
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
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v0.n (n es PAR). Ej: v0.2';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Formato: v1.n.i (i es PAR). Ej: v1.0.2';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Formato: v1.n.iAR (i es PAR). Ej: v1.0.2AR';
    } else {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato Estricto: v1.0';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Opciones: v1.n (Consolidar) o v1.nAR (Paso a Control). n >= actual.';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Formato: v1.nACG (Final). n >= actual.';
    }
    return 'Formato estándar';
};
