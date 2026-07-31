import {
  collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, query, Timestamp
} from 'firebase/firestore';
import mammoth from 'mammoth';
import { db } from './firebaseConfig';
import { SavedProcessEntry, UpProcess, ParsedWordProcess } from '../types/upEngine';
import { INITIAL_PRESETS } from './upEnginePresets';

const COLLECTION_NAME = 'processes';

export const normalizeProcessId = (name: string): string => {
  const slug = (name || 'proceso')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `proc_${slug || 'unnamed'}`;
};

export class UpEngineService {
  /**
   * Subscribe in real-time to Firestore `processes` collection.
   * Auto-seeds presets if empty.
   */
  static subscribeToProcesses(callback: (entries: SavedProcessEntry[]) => void) {
    const colRef = collection(db, COLLECTION_NAME);

    return onSnapshot(
      colRef,
      async (snapshot) => {
        if (snapshot.empty) {
          console.log('[UpEngine] Processes collection is empty. Auto-seeding default presets...');
          await UpEngineService.seedPresetsIfEmpty();
          return;
        }

        const entries: SavedProcessEntry[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as SavedProcessEntry;
          if (data && data.process) {
            entries.push({
              id: docSnap.id,
              savedAt: data.savedAt || new Date().toLocaleString('es-CL'),
              process: data.process
            });
          }
        });

        // Sort by savedAt or process name
        entries.sort((a, b) => a.process.name.localeCompare(b.process.name));
        callback(entries);
      },
      (error) => {
        console.error('[UpEngine] Firestore subscription error:', error);
      }
    );
  }

  /**
   * Save or update a process document in Firestore `processes` collection.
   */
  static async saveProcess(entry: SavedProcessEntry): Promise<void> {
    try {
      const docId = entry.id.startsWith('proc_') ? entry.id : normalizeProcessId(entry.process.name);
      const entryToSave: SavedProcessEntry = {
        ...entry,
        id: docId,
        savedAt: new Date().toLocaleString('es-CL'),
        process: {
          ...entry.process,
          id: entry.process.id || docId,
          lastUpdated: new Date().toISOString().split('T')[0]
        }
      };

      const docRef = doc(db, COLLECTION_NAME, docId);
      await setDoc(docRef, entryToSave, { merge: true });
    } catch (err) {
      console.error('[UpEngine] Error saving process to Firestore:', err);
      throw err;
    }
  }

  /**
   * Delete a single process document from Firestore.
   */
  static async deleteProcess(docId: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, docId);
      await deleteDoc(docRef);
    } catch (err) {
      console.error('[UpEngine] Error deleting process from Firestore:', err);
      throw err;
    }
  }

  /**
   * Clear all processes from Firestore library.
   */
  static async clearAllProcesses(currentEntries: SavedProcessEntry[]): Promise<void> {
    try {
      const deletePromises = currentEntries.map((e) => deleteDoc(doc(db, COLLECTION_NAME, e.id)));
      await Promise.all(deletePromises);
    } catch (err) {
      console.error('[UpEngine] Error clearing process library:', err);
      throw err;
    }
  }

  /**
   * Seed default initial presets to Firestore if empty.
   */
  static async seedPresetsIfEmpty(): Promise<void> {
    try {
      for (const preset of INITIAL_PRESETS) {
        const docRef = doc(db, COLLECTION_NAME, preset.id);
        await setDoc(docRef, preset, { merge: true });
      }
    } catch (err) {
      console.error('[UpEngine] Error seeding initial presets:', err);
    }
  }

  /**
   * Direct client-side Word document (.docx) parsing using mammoth text extraction.
   * Extracts sections (Purpose, Scope, Roles, Steps, Business Rules, KPIs, SIPOC) directly from the document structure.
   */
  static async parseWordDoc(file: File): Promise<ParsedWordProcess> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mammothRes = await mammoth.extractRawText({ arrayBuffer });
      const rawText = mammothRes.value || '';

      const fileNameClean = file.name.replace(/\.[^/.]+$/, '');
      const slug = normalizeProcessId(fileNameClean);

      // Extract sections by regex and line searching
      const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      let purposeText = '';
      let scopeText = '';
      const extractedSteps: Array<{ id: string; name: string; roleId: string; description: string; inputs: string[]; outputs: string[]; duration: string; rules: string[] }> = [];
      const extractedRoles: Array<{ id: string; title: string; responsibility: string }> = [];
      const extractedRules: Array<{ id: string; description: string; type: string }> = [];

      let currentSection = '';

      for (const line of lines) {
        const lower = line.toLowerCase();

        // Section header detectors
        if (/^(1\.|1\-|\b)?\s*(objetivo|propósito|purpos)/i.test(line)) {
          currentSection = 'purpose';
          continue;
        } else if (/^(2\.|2\-|\b)?\s*(alcance|scope)/i.test(line)) {
          currentSection = 'scope';
          continue;
        } else if (/^(3\.|3\-|\b)?\s*(roles|responsables|participantes)/i.test(line)) {
          currentSection = 'roles';
          continue;
        } else if (/^(4\.|4\-|\b)?\s*(actividades|pasos|procedimiento|flujo)/i.test(line)) {
          currentSection = 'steps';
          continue;
        } else if (/^(5\.|5\-|\b)?\s*(reglas|politicas|políticas|controles)/i.test(line)) {
          currentSection = 'rules';
          continue;
        }

        // Section content assignment
        if (currentSection === 'purpose') {
          if (!purposeText) purposeText = line;
          else if (purposeText.length < 500) purposeText += ' ' + line;
        } else if (currentSection === 'scope') {
          if (!scopeText) scopeText = line;
          else if (scopeText.length < 500) scopeText += ' ' + line;
        } else if (currentSection === 'roles') {
          if (line.length > 3) {
            extractedRoles.push({
              id: `role_${extractedRoles.length + 1}`,
              title: line.replace(/^[\-\*•\d\.]+\s*/, ''),
              responsibility: 'Responsable asignado en la caracterización del proceso.'
            });
          }
        } else if (currentSection === 'steps') {
          if (line.length > 5) {
            extractedSteps.push({
              id: `step_${extractedSteps.length + 1}`,
              name: line.replace(/^[\-\*•\d\.]+\s*/, '').slice(0, 80),
              roleId: extractedRoles[0]?.id || 'role_1',
              description: line,
              inputs: ['Insumos y antecedentes del trámite'],
              outputs: ['Registro y estado actualizado'],
              duration: '30 min',
              rules: ['Verificación de completitud']
            });
          }
        } else if (currentSection === 'rules') {
          if (line.length > 5) {
            extractedRules.push({
              id: `rule_${extractedRules.length + 1}`,
              description: line.replace(/^[\-\*•\d\.]+\s*/, ''),
              type: /bloque|critico|crítico|obligatorio/i.test(line) ? 'Bloqueante' : 'Advertencia'
            });
          }
        }
      }

      // Fallbacks if structured sections were not explicitly found in headers
      if (!purposeText) {
        purposeText = rawText.slice(0, 350) || `Caracterización y especificación del proceso ${fileNameClean}.`;
      }
      if (!scopeText) {
        scopeText = `Aplica a todas las unidades involucradas en la ejecución del proceso ${fileNameClean}.`;
      }
      if (extractedRoles.length === 0) {
        extractedRoles.push({
          id: 'role_1',
          title: 'Analista / Responsable del Proceso',
          responsibility: 'Ejecutar las actividades normativas y operativas definidas.'
        });
      }
      if (extractedSteps.length === 0) {
        // Look for numbered lines in entire text
        const numberedLines = lines.filter(l => /^(\d+[\.\-]|paso|actividad)/i.test(l));
        if (numberedLines.length > 0) {
          numberedLines.forEach((nl, idx) => {
            extractedSteps.push({
              id: `step_${idx + 1}`,
              name: nl.replace(/^[\-\*•\d\.]+\s*/, '').slice(0, 80),
              roleId: extractedRoles[0].id,
              description: nl,
              inputs: ['Entradas del proceso'],
              outputs: ['Salidas y registros'],
              duration: '30 min',
              rules: ['Estandarización normativo-operativa']
            });
          });
        } else {
          extractedSteps.push({
            id: 'step_1',
            name: 'Inicio y Validación del Trámite',
            roleId: extractedRoles[0].id,
            description: rawText.slice(0, 250) || 'Análisis de insumos e inicio de tramitación.',
            inputs: ['Documentación de ingreso'],
            outputs: ['Registro inicial'],
            duration: '30 min',
            rules: ['Completitud de antecedentes']
          });
        }
      }
      if (extractedRules.length === 0) {
        extractedRules.push({
          id: 'rule_1',
          description: 'Cumplimiento estricto de la normativa aplicable e instrucciones de la Jefatura.',
          type: 'Bloqueante'
        });
      }

      return {
        id: slug,
        meta: {
          code: `PROC-${slug.toUpperCase().slice(0, 8)}`,
          name: fileNameClean,
          version: '1.0',
          owner: extractedRoles[0]?.title || 'Responsable del Proceso',
          type: 'Operativo'
        },
        purpose: purposeText,
        scope: scopeText,
        kpis: [
          {
            name: 'Eficiencia de Procesamiento',
            metric: 'Porcentaje de tramitaciones dentro del plazo',
            target: '100%',
            frequency: 'Mensual'
          }
        ],
        sipoc: {
          suppliers: ['Entidades y Unidades Remitentes'],
          inputs: ['Insumos, Solicitudes y Documentos Normativos'],
          processName: fileNameClean,
          outputs: ['Entregables, Informes y Resoluciones Formales'],
          customers: ['Usuarios Institucionales y Beneficiarios']
        },
        roles: extractedRoles,
        steps: extractedSteps,
        businessRules: extractedRules
      };
    } catch (clientErr: any) {
      console.error('[UpEngineService] Direct Word parsing error:', clientErr);
      throw new Error(`Error al leer el archivo Word (${file.name}): ${clientErr.message || 'Formato no válido'}`);
    }
  }

  /**
   * Call server backend endpoint /api/extract-process-from-doc for AI extraction.
   */
  static async extractProcessFromDoc(params: {
    promptText?: string;
    file?: File;
    fileText?: string;
  }): Promise<UpProcess> {
    const formData = new FormData();
    if (params.promptText) formData.append('promptText', params.promptText);
    if (params.fileText) formData.append('fileText', params.fileText);
    if (params.file) formData.append('file', params.file);

    const response = await fetch('/api/extract-process-from-doc', {
      method: 'POST',
      body: formData
    });

    const resData = await response.json();
    if (!response.ok || !resData.success) {
      throw new Error(resData.error || 'Error al invocar servicio de IA.');
    }

    return resData.process as UpProcess;
  }

  /**
   * Parallel automatic synchronization event logger when user submits new loads/requests
   * or clicks "Actualizar y Consolidar Historial" (APPLIES ONLY FOR 'TO BE' AND 'FCE' DOCUMENTS).
   */
  static async registerDocumentSyncEvent(docData: {
    project?: string;
    macroprocess?: string;
    process?: string;
    microprocess?: string;
    docType?: string;
    version?: string;
    state?: string;
    userName?: string;
    comment?: string;
    docId?: string;
    fileUrl?: string;
    fileName?: string;
    extractedProcess?: UpProcess;
  }): Promise<void> {
    // Strictly validate that this sync event ONLY runs for TO BE or FCE documents
    if (docData.docType !== 'TO BE' && docData.docType !== 'FCE') {
      console.log('[UpEngine] Document sync bypassed. Type is not TO BE or FCE:', docData.docType);
      return;
    }

    try {
      const syncRef = doc(collection(db, 'process_sync_logs'));
      await setDoc(syncRef, {
        id: syncRef.id,
        timestamp: new Date().toISOString(),
        formattedTime: new Date().toLocaleString('es-CL'),
        eventType: 'HISTORIAL_CONSOLIDATED_SYNC',
        documentMeta: docData,
        status: 'SYNCHRONIZED',
        engineSource: 'UpEngine-Parallel-Sync'
      });

      // Also upsert or synchronize the process document entry in `processes` collection
      if (docData.project && docData.microprocess) {
        // Use normalized project and microprocess for ID matching, similarly to the logic across the app.
        const processDocId = normalizeProcessId(docData.microprocess); 
        const procRef = doc(db, COLLECTION_NAME, processDocId);
        
        const existingSnap = await getDocs(query(collection(db, COLLECTION_NAME)));
        // Note: we can check for an existing match using the normalized microprocess ID
        const existingData = existingSnap.docs.find(d => {
          if (d.id === processDocId) return true;
          const p = d.data() as SavedProcessEntry;
          return normalizeProcessId(p.process?.microprocess || p.process?.name || '') === processDocId;
        })?.data() as SavedProcessEntry | undefined;

        const baseProcess: UpProcess = existingData?.process || {
          id: processDocId,
          name: docData.microprocess,
          description: `Proceso del microproceso ${docData.microprocess} (${docData.project})`,
          version: docData.version || '1.0',
          lastUpdated: new Date().toISOString().split('T')[0],
          stages: [
            {
              id: 'stg_1',
              number: 1,
              name: 'Iniciación del Proceso',
              description: `Recepción y validación de antecedentes para ${docData.microprocess}`,
              responsibleRole: 'Analista de Gestión',
              substeps: ['Revisar documentación', 'Verificar requisitos mínimos'],
              criticalControlPoints: ['Verificación de completitud documental'],
              estimatedTimeMinutes: 30,
              failureImpact: 'MEDIUM'
            },
            {
              id: 'stg_2',
              number: 2,
              name: 'Ejecución y Control Operativo',
              description: `Procesamiento normativo y aplicación de reglas del microproceso`,
              responsibleRole: 'Coordinador del Proceso',
              substeps: ['Aplicar reglas de negocio', 'Generar registro de trazabilidad'],
              criticalControlPoints: ['Validación de firmas y permisos'],
              estimatedTimeMinutes: 60,
              failureImpact: 'HIGH'
            }
          ],
          governanceRules: [
            {
              id: 'gov_1',
              code: 'REG-01',
              title: 'Aprobación de Versión',
              description: 'Toda versión formal requiere aprobación por referente o coordinador.',
              severity: 'HIGH',
              enforcementType: 'BLOCKING'
            }
          ],
          roles: [
            { id: 'r_1', name: 'Analista de Gestión', responsibilities: ['Cargar documentos', 'Consolidar historial'] },
            { id: 'r_2', name: 'Coordinador', responsibilities: ['Revisar y aprobar versiones finalizadas'] }
          ],
          integrations: [],
          asIsContext: 'Situación baseline previa a la optimización formal.',
          toBeOptimizations: docData.docType === 'TO BE' ? `Optimización registrada en carga ${docData.version || ''}: ${docData.comment || 'Ajuste de eficiencia operativa'}` : undefined,
          fceFactors: docData.docType === 'FCE' ? ['Cumplimiento de tiempos de respuesta', 'Cero inconsistencias en nomenclatura', 'Trazabilidad completa en SGD'] : undefined
        };

        const updatedProcess: UpProcess = {
          ...baseProcess,
          project: docData.project,
          macroprocess: docData.macroprocess,
          process: docData.process,
          microprocess: docData.microprocess,
          docType: docData.docType,
          docState: docData.state,
          docAuthor: docData.userName,
          docComment: docData.comment,
          docFileUrl: docData.fileUrl,
          docFileName: docData.fileName,
          version: docData.version || baseProcess.version,
          lastUpdated: new Date().toISOString().split('T')[0]
        };

        if (docData.extractedProcess) {
          const ex = docData.extractedProcess;
          if (ex.description) updatedProcess.description = ex.description;
          if (ex.asIsContext) updatedProcess.asIsContext = ex.asIsContext;
          if (ex.toBeOptimizations) updatedProcess.toBeOptimizations = ex.toBeOptimizations;
          if (ex.fceFactors && ex.fceFactors.length > 0) updatedProcess.fceFactors = ex.fceFactors;
          if (ex.stages && ex.stages.length > 0) updatedProcess.stages = ex.stages;
          if (ex.governanceRules && ex.governanceRules.length > 0) updatedProcess.governanceRules = ex.governanceRules;
          if (ex.roles && ex.roles.length > 0) updatedProcess.roles = ex.roles;
          if (ex.integrations && ex.integrations.length > 0) updatedProcess.integrations = ex.integrations;
          if (ex.glossary && ex.glossary.length > 0) updatedProcess.glossary = ex.glossary;
          if (ex.subprocesses && ex.subprocesses.length > 0) updatedProcess.subprocesses = ex.subprocesses;
          if (ex.sipocRows && ex.sipocRows.length > 0) updatedProcess.sipocRows = ex.sipocRows;
        }

        const finalDocId = existingData?.id || processDocId;
        const procRefFinal = doc(db, COLLECTION_NAME, finalDocId);

        await setDoc(procRefFinal, {
          id: finalDocId,
          savedAt: new Date().toLocaleString('es-CL'),
          process: updatedProcess
        }, { merge: true });
      }
    } catch (err) {
      console.warn('[UpEngine] Could not write parallel sync log:', err);
    }
  }
}
