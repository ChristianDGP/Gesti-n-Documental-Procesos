
import { ParsedFilenameResult } from '../types';
import { DocState } from '../types';

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

  const lastDotIndex = fullFilename.lastIndexOf('.');
  const filenameBase = lastDotIndex !== -1 ? fullFilename.substring(0, lastDotIndex) : fullFilename;
  
  if (filenameBase.length > 80) {
    result.errores.push(`El nombre del archivo excede 80 caracteres.`);
  }

  const parts = filenameBase.split(' - ');

  if (parts.length < 4) {
    result.errores.push('Formato incorrecto. Use: "PROYECTO - Microproceso - TIPO - Versión".');
    return result;
  }

  const proyecto = parts[0].toUpperCase();
  const version = parts[parts.length - 1].toUpperCase();
  const tipoCodigo = parts[parts.length - 2].toUpperCase();
  const microproceso = parts.slice(1, parts.length - 2).join(' - ');

  if (proyecto !== 'HPC' && proyecto !== 'HSR') {
    result.errores.push(`Proyecto inválido: ${proyecto}.`);
  } else if (expectedProject && proyecto !== expectedProject.toUpperCase()) {
    result.errores.push(`Proyecto no coincide con la solicitud.`);
  }
  result.proyecto = proyecto as 'HPC' | 'HSR';

  if (!microproceso || microproceso.trim() === '') {
    result.errores.push('Microproceso vacío.');
  } else if (expectedMicro && microproceso.toUpperCase() !== expectedMicro.toUpperCase()) {
    result.errores.push(`Microproceso no coincide.`);
  }
  result.microproceso = microproceso;

  const mapTypeToCode: Record<string, string> = {
      'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM'
  };
  const validCodes = Object.values(mapTypeToCode);
  if (!validCodes.includes(tipoCodigo)) {
      result.errores.push(`Tipo inválido: ${tipoCodigo}.`);
  }
  if (expectedType) {
      const expectedCode = mapTypeToCode[expectedType.toUpperCase()];
      if (tipoCodigo !== expectedCode) {
          result.errores.push(`Tipo no coincide con la solicitud.`);
      }
  }
  result.tipo = tipoCodigo;

  result.nomenclatura = version;

  const regexInitiated = /^0\.0$/;              
  const regexInProcess = /^0\.(\d+)$/;          
  const regexInternal = /^V0\.(\d+)$/;          
  const regexReferent = /^V1\.(\d+)\.(\d+)$/;   
  const regexControl = /^V1\.(\d+)\.(\d+)AR$/;  

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
              result.errores.push('Para Revisión Interna Referente el formato debe ser "v1.n.i" (ej: v1.0.1).');
          } else {
              const i = parseInt(match[2]);
              if (i % 2 === 0) {
                  result.errores.push(`Para Revisión Interna Referente el dígito "i" (${i}) debe ser IMPAR (ej: v1.0.1, v1.0.3).`);
              }
          }
      } else if (expectedRequestType === 'CONTROL') {
          const match = version.match(regexControl);
          if (!match) {
              result.errores.push('Para Revisión Interna Control el formato debe ser "v1.n.iAR" (ej: v1.0.1AR).');
          } else {
              const i = parseInt(match[2]);
              if (i % 2 === 0) {
                  result.errores.push(`Para Revisión Interna Control el dígito "i" (${i}) debe ser IMPAR (ej: v1.0.1AR).`);
              }
          }
      }
  }

  if (result.errores.length === 0) {
      const vUpper = version.toUpperCase();
      
      // REGLAS DE PORCENTAJE CENTRALIZADAS (Espejo de determineStateFromVersion en Backend)
      if (vUpper.endsWith('ACG')) {
          result.estado = 'Aprobado';
          result.porcentaje = 100;
      } else if (vUpper.endsWith('AR')) {
          result.estado = vUpper.match(/^V1\.\d+\.\d+AR$/) ? 'Revisión Interna Control' : 'Enviado a Control de Gestión';
          result.porcentaje = 90;
      } else if (vUpper.startsWith('V1.')) {
          result.estado = vUpper.split('.').length > 2 ? 'Revisión Interna Referente' : 'Enviado a Referente';
          result.porcentaje = 80;
      } else if (vUpper.startsWith('V0.')) {
          result.estado = 'En revisión interna'; 
          result.porcentaje = 60;
      } else if (vUpper === '0.0') {
          result.estado = 'Iniciado';
          result.porcentaje = 10;
      } else if (/^0\.\d+$/.test(vUpper)) {
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

export const validateCoordinatorRules = (
    filename: string,
    currentVersion: string, 
    currentState: DocState,
    action: 'APPROVE' | 'REJECT'
): { valid: boolean; error?: string; hint?: string } => {
    
    const parts = filename.replace(/\.[^/.]+$/, "").split(' - ');
    if (parts.length < 4) return { valid: false, error: 'Formato de nombre inválido.' };
    const newVersion = parts[parts.length - 1].toUpperCase();

    const getParts = (v: string) => {
        let m;
        const vUpper = v.toUpperCase();
        m = vUpper.match(/^V?0\.(\d+)$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: false, acg: false, type: 'v0.n' };
        m = vUpper.match(/^V1\.(\d+)$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: false, acg: false, type: 'v1.n' };
        m = vUpper.match(/^V1\.(\d+)\.(\d+)$/);
        if (m) return { n: parseInt(m[1]), i: parseInt(m[2]), ar: false, acg: false, type: 'v1.n.i' };
        m = vUpper.match(/^V1\.(\d+)\.(\d+)AR$/);
        if (m) return { n: parseInt(m[1]), i: parseInt(m[2]), ar: true, acg: false, type: 'v1.n.iAR' };
        m = vUpper.match(/^V1\.(\d+)AR$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: true, acg: false, type: 'v1.nAR' };
        m = vUpper.match(/^V1\.(\d+)ACG$/);
        if (m) return { n: parseInt(m[1]), i: null, ar: false, acg: true, type: 'v1.nACG' };
        return null;
    };

    const current = getParts(currentVersion);
    const incoming = getParts(newVersion);

    if (!incoming) return { valid: false, error: 'Formato de versión no reconocido.' };

    if (currentState === DocState.INTERNAL_REVIEW) {
        if (action === 'APPROVE') {
            if (incoming.type !== 'v1.n') return { valid: false, error: 'Aprobación requiere v1.n (Ej: v1.0).' };
            return { valid: true };
        } else {
            if (incoming.type !== 'v0.n') return { valid: false, error: 'Rechazo requiere v0.n.' };
            if (incoming.n % 2 !== 0) return { valid: false, error: `Para rechazar, "n" (${incoming.n}) debe ser PAR (ej: v0.2, v0.4).` };
            return { valid: true };
        }
    }

    if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) {
        if (action === 'APPROVE') {
            if (incoming.type === 'v1.n') {
                if (current && incoming.n <= current.n) return { valid: false, error: `Para consolidar versión, v1.${incoming.n} debe ser mayor a la actual (v1.${current.n}...).` };
                return { valid: true };
            } else if (incoming.type === 'v1.nAR') {
                if (current?.type === 'v1.n.i') {
                    if (incoming.n <= current.n) return { valid: false, error: `Al aprobar borrador para Control, debe consolidar versión (v1.${current.n + 1}AR).` };
                    return { valid: true };
                }
                if (current?.type === 'v1.n') {
                    if (incoming.n !== current.n) return { valid: false, error: `Al aprobar versión limpia para Control, mantenga el número (v1.${current.n}AR).` };
                    return { valid: true };
                }
                if (current && incoming.n < current.n) return { valid: false, error: 'No puede bajar de versión.' };
                return { valid: true };
            } else {
                return { valid: false, error: 'Aprobación requiere v1.n (Consolidar) o v1.nAR (Control).' };
            }
        } else {
            if (incoming.type !== 'v1.n.i') return { valid: false, error: 'Rechazo requiere v1.n.i (Ej: v1.0.2).' };
            if (incoming.i! % 2 !== 0) return { valid: false, error: `Para rechazar, el último dígito "i" (${incoming.i}) debe ser PAR.` };
            if (current && incoming.n !== current.n) return { valid: false, error: `El rechazo debe mantener la versión base v1.${current.n}.` };
            if (current?.i !== null && incoming.i! <= current!.i!) return { valid: false, error: `El dígito "i" (${incoming.i}) debe ser mayor al actual.` };
            return { valid: true };
        }
    }

    if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) {
        if (action === 'APPROVE') {
            if (incoming.type === 'v1.nAR') {
                if (current && incoming.n <= current.n) return { valid: false, error: `Para avanzar versión, v1.${incoming.n}AR debe ser mayor a la actual (v1.${current.n}...).` };
                return { valid: true };
            }
            if (incoming.type === 'v1.nACG') {
                return { valid: true };
            }
            return { valid: false, error: 'Aprobación requiere v1.nAR (avance) o v1.nACG (final).' };
        } else {
            if (incoming.type !== 'v1.n.iAR') return { valid: false, error: 'Rechazo requiere v1.n.iAR (Ej: v1.0.2AR).' };
            if (incoming.i! % 2 !== 0) return { valid: false, error: `Para rechazar, el dígito "i" (${incoming.i}) debe ser PAR.` };
            if (current && current.type === 'v1.n.iAR') {
                 if (incoming.i! <= current.i!) return { valid: false, error: `El dígito "i" (${incoming.i}) debe ser mayor al actual (${current.i}).` };
            }
            return { valid: true };
        }
    }

    return { valid: true };
}

export const getCoordinatorRuleHint = (currentState: DocState, action: 'APPROVE' | 'REJECT'): string => {
    if (action === 'REJECT') {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v0.n (n PAR). Ej: v0.2';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) return 'Formato: v1.n.i (i PAR). Ej: v1.0.2';
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Formato: v1.n.iAR (i PAR y mayor). Ej: v1.0.2AR';
    } else {
        if (currentState === DocState.INTERNAL_REVIEW) return 'Formato: v1.n (Ej: v1.0)';
        if (currentState === DocState.SENT_TO_REFERENT || currentState === DocState.REFERENT_REVIEW) {
            return 'Opción 1: v1.n (Consolidar) / Opción 2: v1.nAR (Enviar a Control)';
        }
        if (currentState === DocState.SENT_TO_CONTROL || currentState === DocState.CONTROL_REVIEW) return 'Opción 1: v1.nAR (Avance) / Opción 2: v1.nACG (Final)';
    }
    return 'Formato estándar';
};
