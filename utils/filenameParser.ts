import { ParsedFilenameResult } from '../types';

/**
 * Parsea y valida el nombre de archivo según la norma institucional.
 * Formato esperado: Proyecto - Descripción Nomenclatura
 * Ejemplo: HPC - Manual de Usuario v1.0
 */
export const parseDocumentFilename = (fullFilename: string): ParsedFilenameResult => {
  const result: ParsedFilenameResult = {
    valido: false,
    errores: []
  };

  // 1. Validar longitud máxima (55 caracteres)
  // Nota: Se valida el nombre completo incluyendo extensión, o solo el nombre base? 
  // Según buenas prácticas de UX y el requerimiento, validamos el string completo 
  // pero analizamos la estructura sin la extensión.
  if (fullFilename.length > 55) {
    result.errores.push(`El nombre del archivo excede los 55 caracteres (actual: ${fullFilename.length}).`);
  }

  // Separar nombre de extensión
  const lastDotIndex = fullFilename.lastIndexOf('.');
  const filenameBase = lastDotIndex !== -1 ? fullFilename.substring(0, lastDotIndex) : fullFilename;
  const extension = lastDotIndex !== -1 ? fullFilename.substring(lastDotIndex) : '';

  // 2. Validar Estructura General: "PROYECTO - DESCRIPCION NOMENCLATURA"
  // Debe contener " - "
  const parts = filenameBase.split(' - ');
  if (parts.length !== 2) {
    result.errores.push('El formato debe ser "Proyecto - Descripción Nomenclatura". Falta el separador " - " o hay más de uno.');
    return result;
  }

  const [proyecto, resto] = parts;

  // 3. Validar Proyecto
  if (proyecto !== 'HPC' && proyecto !== 'HSR') {
    result.errores.push(`El proyecto "${proyecto}" no es válido. Debe ser "HPC" o "HSR".`);
  } else {
    result.proyecto = proyecto as 'HPC' | 'HSR';
  }

  // 4. Separar Descripción y Nomenclatura
  // La nomenclatura es la última palabra después del último espacio.
  const lastSpaceIndex = resto.lastIndexOf(' ');
  if (lastSpaceIndex === -1) {
    result.errores.push('No se encuentra separación entre Descripción y Nomenclatura.');
    return result;
  }

  const descripcion = resto.substring(0, lastSpaceIndex).trim();
  const nomenclatura = resto.substring(lastSpaceIndex + 1).trim();

  if (descripcion.length === 0) {
    result.errores.push('La descripción no puede estar vacía.');
  }
  
  result.descripcion = descripcion;
  result.nomenclatura = nomenclatura;

  // 5. Analizar Nomenclatura (Regex logic)
  let matchFound = false;

  // Regla 1: Documento - 0.0 (Iniciado)
  if (/^0\.0$/.test(nomenclatura)) {
    result.estado = 'Iniciado';
    result.porcentaje = 10;
    result.explicacion = 'Versión inicial del documento. Primera versión creada.';
    matchFound = true;
  }
  // Regla 2: Documento - 0.n (En proceso)
  // n debe ser entero > 0 (ej: 0.1, 0.2, 0.15)
  else if (/^0\.[1-9]\d*$/.test(nomenclatura)) {
    result.estado = 'En proceso';
    result.porcentaje = 30;
    result.explicacion = '"n" entero. Progreso desde la versión inicial.';
    matchFound = true;
  }
  // Regla 3: Documento - v0.n (En revisión interna)
  else if (/^v0\.\d+$/.test(nomenclatura)) {
    result.estado = 'En revisión interna';
    result.porcentaje = 60;
    const n = parseInt(nomenclatura.split('.')[1], 10);
    const tipoRevision = n % 2 !== 0 ? ' (Analista)' : ' (Jefatura)';
    result.explicacion = `Versión para aprobar por jefatura.${tipoRevision}. Impares analistas, pares jefatura.`;
    matchFound = true;
  }
  // Regla 4: Documento - v1.n (Enviado a referente)
  else if (/^v1\.\d+$/.test(nomenclatura)) {
    result.estado = 'Enviado a Referente';
    result.porcentaje = 80;
    result.explicacion = 'Primera versión formal. "n" iteraciones previas.';
    matchFound = true;
  }
  // Regla 5: Documento - v1.n.i (Revisión con referentes)
  // v1.{n}.{i}
  else if (/^v1\.\d+\.\d+$/.test(nomenclatura)) {
    result.estado = 'Revisión con referentes';
    result.porcentaje = 80; // Mantenemos 80% según sugerencia
    result.explicacion = '"i" entero para iteraciones internas (luego de observaciones del referente).';
    matchFound = true;
  }
  // Regla 6: Documento - v1.nAR (Enviado a Control de Gestión)
  else if (/^v1\.\d+AR$/.test(nomenclatura)) {
    result.estado = 'Enviado a Control de Gestión';
    result.porcentaje = 90;
    result.explicacion = '"AR": Aprobado por Referente.';
    matchFound = true;
  }
  // Regla 7: Documento - v1.n.iAR (Revisión con control de gestión)
  else if (/^v1\.\d+\.\d+AR$/.test(nomenclatura)) {
    result.estado = 'Revisión con Control de Gestión';
    result.porcentaje = 90; // Mantenemos 90% según sugerencia
    result.explicacion = '"i" entero para iteraciones internas luego de observaciones de CG.';
    matchFound = true;
  }
  // Regla 8: Documento - v1.nACG (Aprobado Control Gestión)
  else if (/^v1\.\d+ACG$/.test(nomenclatura)) {
    result.estado = 'Aprobado Control Gestión';
    result.porcentaje = 100;
    result.explicacion = '"ACG": versión aprobada oficialmente.';
    matchFound = true;
  }

  if (!matchFound) {
    result.errores.push(`La nomenclatura "${nomenclatura}" no es reconocida o no cumple con el formato estándar (ej: 0.0, 0.1, v0.1, v1.0, v1.0AR, etc).`);
  }

  // Resultado final
  result.valido = result.errores.length === 0;
  return result;
};