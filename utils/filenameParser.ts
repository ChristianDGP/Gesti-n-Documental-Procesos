
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
    
    // Parse parts
    const parts = filename.replace(/\.[^/.]+$/, "").split(' - ');
    if (parts.length < 4) return { valid: false, error: 'Formato de nombre inválido.' };
    const newVersion = parts[parts.length - 1];

    // Helper to decompose version into components
    const getParts = (v: string) => {
        let m;
        // v0.n (Internal Request or Reject Internal)
        m = v.match(/^v?0\.(\d+)$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: false, acg: false, type: 'v0.n' };
        
        // v1.n (Internal Approve or Referent Approve)
        m = v.match(/^v1\.(\d+)$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: false, acg: false, type: 'v1.n' };

        // v1.n.i (Referent Request OR Referent Reject)
        m = v.match(/^v1\.(\d+)\.(\d+)$/);
        if (m) return { n: parseInt(m[1]), i: parseInt(m[2]), ar: false, acg: false, type: 'v1.n.i' };

        // v1.n.iAR (Control Request OR Control Reject)
        m = v.match(/^v1\.(\d+)\.(\d+)AR$/);
        if (m) return { n: parseInt(m[1]), i: parseInt(m[2]), ar: true, acg: false, type: 'v1.n.iAR' };
        
        // v1.nAR (Control Approve / Version Advance)
        m = v.match(/^v1\.(\d+)AR$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: true, acg: false, type: 'v1.nAR' };

        // v1.nACG (Final Approval)
        m = v.match(/^v1\.(\d+)ACG$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: false, acg: true, type: 'v1.nACG' };

        return null;
    };

    const current = getParts(currentVersion);
    const incoming = getParts(newVersion);

    if (!incoming) return { valid: false, error: 'Formato de versión no reconocido.' };

    // =========================================================
    // 3.1 & 3.2: INTERNAL REVIEW
    // =========================================================
    if (currentState === DocState.INTERNAL_REVIEW) {
        if (action === 'APPROVE') {
            // 3.1: Aprobar revisión interna: subir v1.n (entero)
            if (incoming.type !== 'v1.n') return { valid: false, error: 'Aprobación requiere v1.n (Ej: v1.0).' };
            return { valid: true };
        } else {
            // 3.2: Rechazar revisión interna: subir v0.n (par)
            if (incoming.type !== 'v0.n') return { valid: false, error: 'Rechazo requiere v0.n.' };
            if (incoming.n % 2 !== 0) return { valid: false, error: `Para rechazar, "n" (${incoming.n}) debe ser PAR (ej: v0.2, v0.4).` };
            return { valid: true };
        }
    }

    // =========================================================
    // B. REFERENT REVIEW (Reglas Actualizadas)
    // =========================================================
    if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) {
        if (action === 'APPROVE') {
            // 3.3: Aprobar referente: subir v1.n (n > solicitud)
            if (incoming.type !== 'v1.n') return { valid: false, error: 'Aprobación requiere v1.n.' };
            if (current && incoming.n <= current.n) return { valid: false, error: `La versión v1.${incoming.n} debe ser mayor a la actual (v1.${current.n}...).` };
            return { valid: true };
        } else {
            // REGLA ACTUALIZADA (B): Rechazar referente: subir v1.n.i (i par)
            // Antes era v0.n.i. Ahora se mantiene en v1.
            if (incoming.type !== 'v1.n.i') return { valid: false, error: 'Rechazo requiere v1.n.i (Ej: v1.0.2).' };
            if (incoming.i! % 2 !== 0) return { valid: false, error: `Para rechazar, el último dígito "i" (${incoming.i}) debe ser PAR.` };
            return { valid: true };
        }
    }

    // =========================================================
    // C. CONTROL DE GESTIÓN (Escenarios Múltiples)
    // =========================================================
    if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) {
        if (action === 'APPROVE') {
            // Escenario 1: Aprobar cambios de versión (v1.nAR -> v1.(n+1)AR)
            if (incoming.type === 'v1.nAR') {
                if (current && incoming.n <= current.n) return { valid: false, error: `Para avanzar versión, v1.${incoming.n}AR debe ser mayor a la actual (v1.${current.n}...).` };
                return { valid: true };
            }
            
            // Escenario 3: Aprobación Final (v1.nACG)
            if (incoming.type === 'v1.nACG') {
                // Aquí permitimos v1.nACG. Generalmente n es igual al actual o mayor.
                // Como es final, asumimos que es válido si tiene el sufijo ACG.
                return { valid: true };
            }

            return { valid: false, error: 'Aprobación requiere v1.nAR (avance) o v1.nACG (final).' };
        } else {
            // Escenario 2 (REGLA ACTUALIZADA): Rechazar Control: subir v1.n.iAR (i par y mayor al anterior)
            if (incoming.type !== 'v1.n.iAR') return { valid: false, error: 'Rechazo requiere v1.n.iAR (Ej: v1.0.2AR).' };
            if (incoming.i! % 2 !== 0) return { valid: false, error: `Para rechazar, el dígito "i" (${incoming.i}) debe ser PAR.` };
            
            // Nuevo check: i debe ser mayor al actual
            if (current && current.type === 'v1.n.iAR') {
                 if (incoming.i! <= current.i!) return { valid: false, error: `El dígito "i" (${incoming.i}) debe ser mayor al actual (${current.i}).` };
            }

            return { valid: true };
        }
    }

    // Fallback for other states (not strict)
    return { valid: true };
}

/**
 * Genera el texto de ayuda para el modal
 */
export const getCoordinatorRuleHint = (currentState: DocState, action: 'APPROVE' | 'REJECT'): string => {
    if (action === 'REJECT') {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v0.n (n PAR). Ej: v0.2';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Formato: v1.n.i (i PAR). Ej: v1.0.2';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Formato: v1.n.iAR (i PAR y mayor). Ej: v1.0.2AR';
    } else {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v1.n (Ej: v1.0)';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Formato: v1.n (n > actual). Ej: v1.1';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Opción 1: v1.nAR (Avance) / Opción 2: v1.nACG (Final)';
    }
    return 'Formato estándar';
};
