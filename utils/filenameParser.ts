
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

  // Logic map for state detection (Simplified for parser)
  if (result.errores.length === 0) {
      // Infer basic state info if needed, mainly for creation
      if (version.includes('ACG')) result.estado = 'Aprobado';
      else if (version.includes('AR')) result.estado = 'Control Gestión';
      else result.estado = 'En Proceso';
  }

  result.valido = result.errores.length === 0;
  return result;
};

/**
 * Valida las reglas de negocio específicas para transición de versiones.
 * @param currentVersion Versión actual del documento en el sistema
 * @param newVersion Versión del archivo que se está subiendo
 * @param action Tipo de acción (REQUEST, APPROVE, REJECT)
 */
export const checkVersionRules = (currentVersion: string, newVersion: string, action: 'REQUEST' | 'APPROVE' | 'REJECT'): { valid: boolean; error?: string } => {
    
    // Normalizar versiones (quitar espacios)
    const cur = currentVersion.trim();
    const nev = newVersion.trim();

    // Helper: isOdd
    const isOdd = (n: number) => n % 2 !== 0;
    const isEven = (n: number) => n % 2 === 0;

    // --- REGLAS PARA ANALISTA (SOLICITAR APROBACIÓN) ---
    // Se valida la versión ACTUAL del documento (o la que acaba de subir para solicitar)
    if (action === 'REQUEST') {
        // v0.n -> n impar
        let match = cur.match(/^v0\.(\d+)$/);
        if (match) {
            const n = parseInt(match[1]);
            return isOdd(n) 
                ? { valid: true } 
                : { valid: false, error: `Para solicitar aprobación en v0.n, 'n' debe ser impar (Actual: ${cur}).` };
        }

        // v1.n.i -> i impar
        match = cur.match(/^v1\.(\d+)\.(\d+)$/);
        if (match) {
            const i = parseInt(match[2]);
            return isOdd(i) 
                ? { valid: true } 
                : { valid: false, error: `Para solicitar aprobación en v1.n.i, 'i' debe ser impar (Actual: ${cur}).` };
        }

        // v1.n.iAR -> i impar
        match = cur.match(/^v1\.(\d+)\.(\d+)AR$/);
        if (match) {
            const i = parseInt(match[2]);
            return isOdd(i) 
                ? { valid: true } 
                : { valid: false, error: `Para solicitar aprobación en v1.n.iAR, 'i' debe ser impar (Actual: ${cur}).` };
        }
        
        return { valid: false, error: `Nomenclatura actual (${cur}) no es válida para solicitar aprobación.` };
    }

    // --- REGLAS PARA COORDINADOR / ADMIN (APROBAR) ---
    if (action === 'APPROVE') {
        // Caso 1: v0.n (n impar) -> Sube v1.n (n entero, asumimos n coincide o es nueva secuencia v1.0?)
        // Prompt: "debe subir un archivo terminado en v1.n"
        // Interpretation: Transition from v0.X to v1.Y. 
        if (/^v0\.\d+$/.test(cur)) {
            if (/^v1\.\d+$/.test(nev)) return { valid: true };
            return { valid: false, error: `Para aprobar v0.n, el archivo debe ser v1.n (Subido: ${nev}).` };
        }

        // Caso 2: v1.n.i (n entero, i impar) -> Sube v1.n+1 (incrementa n en 1)
        let match = cur.match(/^v1\.(\d+)\.(\d+)$/);
        if (match) {
            const currentN = parseInt(match[1]);
            //const currentI = parseInt(match[2]);
            
            // Check new version structure v1.M
            // Prompt says: "terminado en v1.n + 1". Assuming structure v1.(n+1)
            // Wait, does it lose the third digit? "terminado en v1.n" usually implies 2 digits.
            // Let's assume standard release: v1.0.1 -> v1.1
            const newMatch = nev.match(/^v1\.(\d+)$/); // Or v1.n? Prompt is vague on structure, strictly says "v1.n+1"
            
            // Let's allow v1.(n+1) OR v1.(n+1).0 if strict semantic
            // Prompt literal: "terminado en v1.n + 1, donde n es un numero entero".
            // Let's check if the middle digit incremented.
            
            // Try to match v1.X or v1.X.Y where X = currentN + 1
            const newMatchComplex = nev.match(/^v1\.(\d+)(\.\d+)?$/);
            if (newMatchComplex) {
                const newN = parseInt(newMatchComplex[1]);
                if (newN === currentN + 1) return { valid: true };
                return { valid: false, error: `Para aprobar, se debe incrementar el segundo dígito (v1.${currentN}.x -> v1.${currentN + 1}). Subido: ${nev}` };
            }
             return { valid: false, error: `Formato de aprobación incorrecto para v1.n.i. Esperado v1.${currentN + 1}.` };
        }

        // Caso 3: v1.n.iAR (i impar) -> Sube v1.n+1 (con AR)
        match = cur.match(/^v1\.(\d+)\.(\d+)AR$/);
        if (match) {
            const currentN = parseInt(match[1]);
            // Check new version structure v1.(n+1)AR
            const newMatch = nev.match(/^v1\.(\d+)(\.\d+)?AR$/);
             if (newMatch) {
                const newN = parseInt(newMatch[1]);
                if (newN === currentN + 1) return { valid: true };
                return { valid: false, error: `Para aprobar ${cur}, se debe incrementar el segundo dígito y mantener AR (v1.${currentN + 1}..AR). Subido: ${nev}` };
            }
             return { valid: false, error: `Formato de aprobación incorrecto para AR. Esperado v1.${currentN+1}..AR` };
        }
    }

    // --- REGLAS PARA COORDINADOR / ADMIN (RECHAZAR) ---
    if (action === 'REJECT') {
        // Caso 1: v0.n (n impar/impar context?) -> Prompt: "v0.n (n numero par)" is the RESULT.
        // So input was v0.odd. Output must be v0.even (likely +1).
        if (/^v0\.\d+$/.test(cur)) {
            const newMatch = nev.match(/^v0\.(\d+)$/);
            if (newMatch) {
                const newN = parseInt(newMatch[1]);
                if (isEven(newN)) return { valid: true };
                return { valid: false, error: `Para rechazar, la versión v0.n debe tener 'n' par. (Subido: ${nev})` };
            }
            // Prompt says: "debe subir un archivo terminado en v1.n" for rejection of v0.n (Wait, re-reading prompt).
            // Prompt says for REJECT: "v0.n: donde n es un numero par, debe subir un archivo terminado en v1.n" -> NO.
            // Prompt syntax: "v0.n: donde n es un numero par...". This describes the OUTPUT file requirement.
            // So for v0.x, output must be v0.y where y is even.
             return { valid: false, error: `Para rechazar v0.x, debe subir v0.n (par). Subido: ${nev}` };
        }

        // Caso 2: v1.n.i -> Output v1.n.i (i par)
        // Prompt: "v1.n.i: donde n es un numero entero, i es un numero par."
        if (/^v1\.\d+\.\d+$/.test(cur)) {
            const newMatch = nev.match(/^v1\.(\d+)\.(\d+)$/);
            if (newMatch) {
                const newI = parseInt(newMatch[2]);
                if (isEven(newI)) return { valid: true };
                return { valid: false, error: `Para rechazar v1.n.i, el tercer dígito 'i' debe ser par. (Subido: ${nev})` };
            }
             return { valid: false, error: `Formato de rechazo incorrecto. Esperado v1.n.i (par).` };
        }

        // Caso 3: v1.n.iAR -> Output v1.n.iAR (i par)
        if (/^v1\.\d+\.\d+AR$/.test(cur)) {
            const newMatch = nev.match(/^v1\.(\d+)\.(\d+)AR$/);
            if (newMatch) {
                const newI = parseInt(newMatch[2]);
                if (isEven(newI)) return { valid: true };
                return { valid: false, error: `Para rechazar v1.n.iAR, el tercer dígito 'i' debe ser par. (Subido: ${nev})` };
            }
            return { valid: false, error: `Formato de rechazo incorrecto. Esperado v1.n.iAR (par).` };
        }
    }

    return { valid: true }; // Fallback for unmatched patterns (or handle strictly as error)
};
