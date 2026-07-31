import React, { useState, useEffect } from 'react';
import { UpProcess } from '../../types/upEngine';
import {
  FileText, Shield, AlertTriangle, Layers, Users, Cpu,
  CheckCircle2, Clock, Activity, ChevronDown, ChevronRight, Plus,
  Edit2, Trash2, BookOpen, AlertCircle, ArrowRight, Zap, ListChecks,
  Sliders, Check, Sparkles, Filter, ExternalLink, Target, Calculator,
  Calendar, TrendingUp, BarChart2, UserCheck, Save, RefreshCw, FileUp, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  process: UpProcess | null;
  microprocessName: string;
  projectName?: string;
  docType?: string;
  initialFramework?: 'TO_BE' | 'FCE';
  hasDocument?: boolean;
  isStaged?: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  onOpenUploadModal?: () => void;
  onSaveProcess?: () => void;
  onCancelStaged?: () => void;
  onDeleteProcess?: () => void;
  onProcessDataChange?: (updatedFields: Partial<UpProcess>) => void;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface SipocRow {
  supplier: string;
  input: string;
  processName: string;
  output: string;
  customer: string;
}

export interface SubprocessItem {
  id: string;
  code: string;
  name: string;
  activities: string[];
}

export const ProcessSpecificationManual: React.FC<Props> = ({
  process,
  microprocessName,
  projectName = 'PROYECTO GENERAL',
  docType = 'TO BE',
  initialFramework,
  hasDocument = true,
  isStaged = false,
  isSaving = false,
  isDeleting = false,
  onOpenUploadModal,
  onSaveProcess,
  onCancelStaged,
  onDeleteProcess
}) => {
  const [activeFramework, setActiveFramework] = useState<'TO_BE' | 'FCE'>(
    initialFramework || (docType === 'FCE' ? 'FCE' : 'TO_BE')
  );

  useEffect(() => {
    if (initialFramework) {
      setActiveFramework(initialFramework);
    } else if (docType) {
      setActiveFramework(docType === 'FCE' ? 'FCE' : 'TO_BE');
    }
  }, [initialFramework, docType]);

  // FCE Dedicated State
  const [isEditingFce, setIsEditingFce] = useState(false);
  const [fceData, setFceData] = useState({
    objectiveType: 'porcentaje', // 'cantidad' | 'porcentaje' | 'numero' | 'satisfaccion'
    objectiveText: '',
    currentSituation: '',
    measurementRequirements: '',
    formula: '',
    periodicity: 'Mensual' as 'Mensual' | 'Trimestral' | 'Semestral' | 'Anual',
    targetRanges: {
      range1: '',
      range2: '',
      range3: ''
    },
    otherRanges: {
      range1: '',
      range2: '',
      range3: ''
    },
    baseline: {
      status1: '',
      status2: '',
      counterpartDetails: ''
    },
    kpiOwner: ''
  });

  // Accordion Expand/Collapse state
  const [expandedSubprocesses, setExpandedSubprocesses] = useState<Record<string, boolean>>({});

  // Modal / Inline Add Subprocess state
  const [isAddingSubprocess, setIsAddingSubprocess] = useState(false);
  const [newSubprocessName, setNewSubprocessName] = useState('');

  // Editing activity state
  const [addingActivityToId, setAddingActivityToId] = useState<string | null>(null);
  const [newActivityText, setNewActivityText] = useState('');

  // Dynamic Glossary Terms
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);

  // Dynamic Subprocesses & Activities
  const [subprocesses, setSubprocesses] = useState<SubprocessItem[]>([]);

  // Dynamic SIPOC Matrix Data
  const [sipocRows, setSipocRows] = useState<SipocRow[]>([]);

  // Populate or blank out data based on document existence
  useEffect(() => {
    if (!hasDocument) {
      setFceData({
        objectiveType: 'porcentaje',
        objectiveText: '',
        currentSituation: '',
        measurementRequirements: '',
        formula: '',
        periodicity: 'Mensual',
        targetRanges: { range1: '', range2: '', range3: '' },
        otherRanges: { range1: '', range2: '', range3: '' },
        baseline: { status1: '', status2: '', counterpartDetails: '' },
        kpiOwner: ''
      });
      setGlossary([]);
      setSubprocesses([]);
      setSipocRows([]);
    } else {
      // If process has stages, map them to sub-processes and SIPOC
      if (process?.subprocesses && process.subprocesses.length > 0) {
        const mappedSp: SubprocessItem[] = process.subprocesses.map((sp, i) => ({
          id: sp.id || `sub_${Date.now()}_${i}`,
          code: sp.code || `4.${i + 1}`,
          name: sp.name,
          activities: sp.activities || []
        }));
        setSubprocesses(mappedSp);
        const expandState: Record<string, boolean> = {};
        mappedSp.forEach((s) => (expandState[s.id] = true));
        setExpandedSubprocesses(expandState);
      } else if (process?.stages && process.stages.length > 0) {
        const mappedSp: SubprocessItem[] = process.stages.map((stg, i) => ({
          id: stg.id || `sub_${i + 1}`,
          code: `4.${stg.number || (i + 1)}`,
          name: stg.name,
          activities: stg.substeps && stg.substeps.length > 0 ? stg.substeps : [stg.description]
        }));
        setSubprocesses(mappedSp);

        const expandState: Record<string, boolean> = {};
        mappedSp.forEach((s) => (expandState[s.id] = true));
        setExpandedSubprocesses(expandState);
      } else {
        setSubprocesses([]);
      }

      if (process?.sipocRows && process.sipocRows.length > 0) {
        setSipocRows(process.sipocRows as SipocRow[]);
      } else if (process?.stages && process.stages.length > 0) {
        const mappedSipoc: SipocRow[] = process.stages.map((stg, i) => ({
          supplier: stg.responsibleRole || 'Área Responsable',
          input: stg.substeps?.[0] || 'Requisitos normativos del proceso',
          processName: `(4.${stg.number || (i + 1)}) ${stg.name}`,
          output: stg.criticalControlPoints?.[0] || 'Entregable del proceso',
          customer: 'Usuario Destinatario'
        }));
        setSipocRows(mappedSipoc);
      } else {
        setSipocRows([]);
      }
      
      if (process?.glossary && process.glossary.length > 0) {
        setGlossary(process.glossary as GlossaryTerm[]);
      } else {
        setGlossary([]);
      }

      if (process) {
        setFceData({
          objectiveType: 'porcentaje',
          objectiveText: process.description ? `Indicador normativo enfocado en: ${process.description}` : `Indicador de desempeño para ${microprocessName}`,
          currentSituation: process.asIsContext || 'Situación operativa según documentación formal.',
          measurementRequirements: process.toBeOptimizations || 'Requerimientos de medición técnica.',
          formula: 'KPI = ( Total Registros Procesados Conformes / Total Ingresados ) * 100',
          periodicity: 'Mensual',
          targetRanges: {
            range1: '>= 95% = Satisfactorio',
            range2: '80% - 94% = Regular',
            range3: '< 80% = Insatisfactorio'
          },
          otherRanges: { range1: '', range2: '', range3: '' },
          baseline: {
            status1: 'Línea de base registrada en versión actual.',
            status2: '',
            counterpartDetails: ''
          },
          kpiOwner: process.docAuthor || 'Jefatura de Área'
        });
      }
    }
  }, [hasDocument, process, microprocessName]);

  const toggleExpandAll = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    subprocesses.forEach((sp) => {
      newState[sp.id] = expand;
    });
    setExpandedSubprocesses(newState);
  };

  const toggleSubprocess = (id: string) => {
    setExpandedSubprocesses((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleAddSubprocess = () => {
    if (!newSubprocessName.trim()) return;
    const nextNum = (subprocesses.length + 1);
    const newSp: SubprocessItem = {
      id: `sub_${Date.now()}`,
      code: `4.${nextNum}`,
      name: newSubprocessName.trim(),
      activities: ['Iniciar procesamiento operativo.', 'Verificar cumplimiento de requisitos normativos.']
    };
    setSubprocesses([...subprocesses, newSp]);
    setExpandedSubprocesses((prev) => ({ ...prev, [newSp.id]: true }));
    setNewSubprocessName('');
    setIsAddingSubprocess(false);
    toast.success('Nuevo subproceso agregado exitosamente.');
  };

  const handleDeleteSubprocess = (id: string) => {
    setSubprocesses(subprocesses.filter((s) => s.id !== id));
    toast.info('Subproceso eliminado.');
  };

  const handleAddActivity = (subprocessId: string) => {
    if (!newActivityText.trim()) return;
    setSubprocesses(
      subprocesses.map((sp) => {
        if (sp.id === subprocessId) {
          return {
            ...sp,
            activities: [...sp.activities, newActivityText.trim()]
          };
        }
        return sp;
      })
    );
    setNewActivityText('');
    setAddingActivityToId(null);
    toast.success('Actividad agregada.');
  };

  const handleDeleteActivity = (subprocessId: string, activityIdx: number) => {
    setSubprocesses(
      subprocesses.map((sp) => {
        if (sp.id === subprocessId) {
          return {
            ...sp,
            activities: sp.activities.filter((_, idx) => idx !== activityIdx)
          };
        }
        return sp;
      })
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn text-slate-800">
      {/* ------------------------------------------------------------- */}
      {/* HEADER SECTION: MANUAL DE ESPECIFICACIÓN DE PROCESOS */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[10px] font-extrabold uppercase rounded-full tracking-wider flex items-center gap-1.5">
                <BookOpen size={12} /> Estándar Institucional UPE
              </span>
              <span className="px-2.5 py-0.5 bg-white/10 text-slate-300 font-mono text-[10px] font-bold rounded">
                versión 2.0
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Manual de Especificación de Procesos
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200/90 font-medium">
              Documentación de Estándares Institucionales TO-BE & Factores Críticos de Éxito (FCE)
            </p>
          </div>

          {/* Framework Indicator & Document Status Badge */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <span className="px-3.5 py-2 bg-white/10 text-white border border-white/20 text-xs font-bold rounded-xl flex items-center gap-2 backdrop-blur-md">
              {activeFramework === 'FCE' ? (
                <>
                  <Activity size={15} className="text-emerald-400" />
                  <span>Factores Críticos de Éxito (FCE)</span>
                </>
              ) : (
                <>
                  <Zap size={15} className="text-indigo-400" />
                  <span>Mapeo TO-BE (Proceso Futuro)</span>
                </>
              )}
            </span>
            {isStaged ? (
              <span className="px-3.5 py-2 bg-amber-500/30 text-amber-200 border border-amber-400/50 text-xs font-extrabold rounded-xl flex items-center gap-1.5 backdrop-blur-md animate-pulse">
                <AlertTriangle size={15} />
                <span>Borrador Pendiente de Confirmar</span>
              </span>
            ) : !hasDocument ? (
              <span className="px-3.5 py-2 bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-bold rounded-xl flex items-center gap-1.5 backdrop-blur-md">
                <AlertTriangle size={15} />
                <span>Pendiente de Actualización</span>
              </span>
            ) : (
              <span className="px-3.5 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold rounded-xl flex items-center gap-1.5 backdrop-blur-md">
                <CheckCircle2 size={15} />
                <span>Registrado en UpEngine</span>
              </span>
            )}
          </div>
        </div>

        {/* BARRA DE ACCIONES DE GESTIÓN (GUARDAR / DESHACER / ELIMINAR / CARGAR) */}
        <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center justify-between gap-4 z-10 relative">
          <div className="text-xs font-medium text-indigo-100 flex items-center gap-2">
            <span className="font-bold text-white uppercase tracking-wider text-[11px] bg-white/10 px-2.5 py-1 rounded-lg">
              {microprocessName || 'Proceso'}
            </span>
            <span>{isStaged ? '• Borrador cargado en vista previa' : hasDocument ? '• Estado publicado y sincronizado' : '• Sin caracterización cargada'}</span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Botón Deshacer / Cancelar Carga */}
            {isStaged && onCancelStaged && (
              <button
                type="button"
                onClick={onCancelStaged}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                title="Descartar la carga en borrador y volver al estado previo"
              >
                <RotateCcw size={15} />
                <span>Deshacer / Cancelar Carga</span>
              </button>
            )}

            {/* Botón Guardar Cambios / Confirmar Carga */}
            {onSaveProcess && (isStaged || hasDocument) && (
              <button
                type="button"
                onClick={onSaveProcess}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/30 disabled:opacity-50"
                title="Guardar y confirmar la caracterización en la base de datos"
              >
                {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{isStaged ? 'Confirmar y Guardar' : 'Guardar Cambios'}</span>
              </button>
            )}

            {/* Botón Eliminar Contenido */}
            {onDeleteProcess && (
              <button
                type="button"
                onClick={onDeleteProcess}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                title="Eliminar permanentemente el contenido y caracterización de este proceso"
              >
                {isDeleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                <span>Eliminar Contenido</span>
              </button>
            )}

            {/* Botón Cargar Documento Word */}
            {onOpenUploadModal && (
              <button
                type="button"
                onClick={onOpenUploadModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-indigo-600/30"
              >
                <FileUp size={15} />
                <span>Cargar Word (.docx)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CONDITIONAL RENDER: NO DOCUMENT ATTACHED VS ACTIVE FRAMEWORK */}
      {!hasDocument ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-200/90 shadow-sm text-center space-y-5 animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-xs">
            <AlertCircle size={28} />
          </div>
          <div className="max-w-lg mx-auto space-y-2">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Sin Información Registrada — {activeFramework === 'FCE' ? 'Pestaña FCE (Indicadores)' : 'Pestaña TO-BE (Proceso Futuro)'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Para no generar confusión, las pestañas TO BE y FCE no muestran información por defecto.
              El manual de especificación, actividades, matriz SIPOC e indicadores se desplegarán únicamente al subir o consolidar un archivo para este microproceso.
            </p>
          </div>

          {onOpenUploadModal && (
            <div className="pt-2 flex justify-center">
              <button
                onClick={onOpenUploadModal}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <FileText size={16} />
                <span>Cargar Documento Word (.docx)</span>
              </button>
            </div>
          )}
        </div>
      ) : activeFramework === 'FCE' ? (
        <div className="space-y-6 animate-fadeIn">
          {/* FCE HEADER ACTIONS / MODE TOGGLE */}
          <div className="bg-emerald-950 text-white rounded-3xl p-6 border border-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                <Activity size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-white">
                  Ficha Técnica de Indicadores — Factores Críticos de Éxito (FCE)
                </h2>
                <p className="text-xs text-emerald-200">
                  Estructura exclusiva de medición, metas, periodicidad, rangos y jefatura responsable.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setIsEditingFce(!isEditingFce);
                if (isEditingFce) toast.success('Cambios de FCE guardados.');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 self-end sm:self-center"
            >
              {isEditingFce ? <Save size={15} /> : <Edit2 size={15} />}
              <span>{isEditingFce ? 'Guardar Cambios FCE' : 'Editar Ficha FCE'}</span>
            </button>
          </div>

          {/* 1. DESCRIPCIÓN DEL INDICADOR */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  1. Descripción del Indicador
                </h3>
                <p className="text-xs text-slate-500">
                  Objetivo claro de la medición, diagnóstico actual y requerimientos operativos.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Objective */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-extrabold text-emerald-800 uppercase flex items-center gap-1.5">
                  <Target size={14} className="text-emerald-600" />
                  Objetivo del Indicador (Describir claramente lo que se quiere medir)
                </span>

                <div className="flex flex-wrap gap-2 pt-1 pb-2">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${fceData.objectiveType === 'cantidad' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`} onClick={() => isEditingFce && setFceData({...fceData, objectiveType: 'cantidad'})}>
                    • Indicador destinado a medir la cantidad de…
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${fceData.objectiveType === 'porcentaje' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`} onClick={() => isEditingFce && setFceData({...fceData, objectiveType: 'porcentaje'})}>
                    • Indicador destinado a medir el porcentaje de…
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${fceData.objectiveType === 'numero' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`} onClick={() => isEditingFce && setFceData({...fceData, objectiveType: 'numero'})}>
                    • Indicador que permite conocer el número de…
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${fceData.objectiveType === 'satisfaccion' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`} onClick={() => isEditingFce && setFceData({...fceData, objectiveType: 'satisfaccion'})}>
                    • Indicador que permite conocer la satisfacción del usuario respecto a…
                  </span>
                </div>

                {isEditingFce ? (
                  <textarea
                    rows={3}
                    value={fceData.objectiveText}
                    onChange={(e) => setFceData({ ...fceData, objectiveText: e.target.value })}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <p className="text-slate-800 font-bold leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                    {fceData.objectiveText}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current Situation */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase block">
                    * Describir la situación actual
                  </span>
                  {isEditingFce ? (
                    <textarea
                      rows={3}
                      value={fceData.currentSituation}
                      onChange={(e) => setFceData({ ...fceData, currentSituation: e.target.value })}
                      className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-slate-700 font-medium leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                      {fceData.currentSituation}
                    </p>
                  )}
                </div>

                {/* Requirements for measurement */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase block">
                    * Describir qué se requiere para realizar la medición
                  </span>
                  {isEditingFce ? (
                    <textarea
                      rows={3}
                      value={fceData.measurementRequirements}
                      onChange={(e) => setFceData({ ...fceData, measurementRequirements: e.target.value })}
                      className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-slate-700 font-medium leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                      {fceData.measurementRequirements}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. FÓRMULA & 3. PERIODICIDAD */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 2. Fórmula */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  2. Fórmula de Cálculo del KPI
                </h3>
              </div>

              <div className="p-5 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl border border-emerald-800 space-y-3">
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase block">
                  Expresión Matemática de Evaluación
                </span>
                {isEditingFce ? (
                  <input
                    type="text"
                    value={fceData.formula}
                    onChange={(e) => setFceData({ ...fceData, formula: e.target.value })}
                    className="w-full p-3 bg-white text-slate-900 font-mono font-bold text-xs rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <div className="text-base sm:text-lg font-mono font-black text-emerald-200 tracking-wide bg-white/10 p-4 rounded-xl border border-white/10 text-center">
                    {fceData.formula}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Periodicidad */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  3. Periodicidad
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {['Mensual', 'Trimestral', 'Semestral', 'Anual'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setFceData({ ...fceData, periodicity: p as any })}
                    className={`p-3 rounded-xl font-extrabold transition-all border flex items-center justify-center gap-2 ${
                      fceData.periodicity === p
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Calendar size={14} />
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. RANGO META & 5. OTROS RANGOS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 4. Rango Meta */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  4
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    4. Rango Meta
                  </h3>
                  <p className="text-xs text-slate-500">Umbrales de cumplimiento prioritario.</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                    Meta 1 (Porcentaje)
                  </span>
                  <p className="font-bold text-slate-900">{fceData.targetRanges.range1}</p>
                </div>

                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                    Meta 2 (Aprobación)
                  </span>
                  <p className="font-bold text-slate-900">{fceData.targetRanges.range2}</p>
                </div>

                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                    Meta 3 (Tiempo de Respuesta)
                  </span>
                  <p className="font-bold text-slate-900">{fceData.targetRanges.range3}</p>
                </div>
              </div>
            </div>

            {/* 5. Otros Rangos */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                  5
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    5. Otros Rangos
                  </h3>
                  <p className="text-xs text-slate-500">Escalas secundarias de tolerancia e insuficiencia.</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase block">
                    Rango 1 (Regular / Insatisfactorio)
                  </span>
                  <p className="font-bold text-slate-900">{fceData.otherRanges.range1}</p>
                </div>

                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase block">
                    Rango 2 (Insuficiente / Crítico)
                  </span>
                  <p className="font-bold text-slate-900">{fceData.otherRanges.range2}</p>
                </div>

                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase block">
                    Rango 3 (Tolerancia Días)
                  </span>
                  <p className="font-bold text-slate-900">{fceData.otherRanges.range3}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 6. LÍNEA BASE (PERIODO DE REFERENCIA) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                6
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  6. Línea Base (Periodo de Referencia)
                </h3>
                <p className="text-xs text-slate-500">Histórico de medición y contraparte del indicador.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">
                  • Opción 1: Estado Inicial
                </span>
                <p className="font-bold text-slate-800">{fceData.baseline.status1}</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">
                  • Opción 2: Análisis Periódico
                </span>
                <p className="font-bold text-slate-800">{fceData.baseline.status2}</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">
                  • Contraparte & Registro Reciente
                </span>
                <p className="font-medium text-slate-700">{fceData.baseline.counterpartDetails}</p>
              </div>
            </div>
          </div>

          {/* 7. RESPONSABLE DEL KPI */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                7
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  7. Responsable del KPI (Desempeño en esta dimensión)
                </h3>
                <p className="text-xs text-slate-500">Jefatura o cargo institucional a cargo del seguimiento del indicador.</p>
              </div>
            </div>

            <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <UserCheck size={20} className="text-emerald-700 shrink-0" />
                <div>
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                    Jefatura a Cargo
                  </span>
                  {isEditingFce ? (
                    <input
                      type="text"
                      value={fceData.kpiOwner}
                      onChange={(e) => setFceData({ ...fceData, kpiOwner: e.target.value })}
                      className="px-3 py-1 bg-white border border-slate-300 text-xs font-bold rounded-lg mt-1"
                    />
                  ) : (
                    <span className="text-sm font-black text-slate-900">{fceData.kpiOwner}</span>
                  )}
                </div>
              </div>

              <span className="px-3 py-1 bg-emerald-600 text-white font-extrabold text-[10px] uppercase rounded-full tracking-wider">
                Cargo Asignado
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* TO_BE FRAMEWORK SPECIFICATION MANUAL (SECTIONS 1, 2, 3, 4) */
        <div className="space-y-8">
          {/* SECTION 1: DEFINICIONES (GLOSARIO TÉCNICO) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                1. Definiciones (Glosario Técnico)
              </h2>
              <p className="text-xs text-slate-500">
                Acrónimos, términos técnicos y conceptos clave aplicables a la gestión operativa.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-slate-100 rounded-full text-slate-600">
            {glossary.length} Términos Definidos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {glossary.length > 0 ? (
            glossary.map((item, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 hover:bg-indigo-50/30 transition-all space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                    {item.term}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-normal">
                    {item.definition}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center space-y-2">
              <BookOpen className="mx-auto text-slate-400" size={24} />
              <p className="text-xs font-bold text-slate-700">Sin Términos Registrados en el Glosario</p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                No hay definiciones técnicas para {microprocessName || 'este microproceso'}. Sube un archivo a UpEngine para cargarlas automáticamente.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: PROCESO & ALCANCE DEL PROCESO */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
            2
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-tight">
              2. PROCESO: {process?.name || microprocessName || 'MICROPROCESO'}
            </h2>
            <p className="text-xs text-slate-500">Delimitación de alcances, gatillos de inicio y estados de finalización.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 2.1 Alcance del Proceso */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sliders size={16} className="text-indigo-600" />
              2.1. Alcance del Proceso
            </h3>

            <div className="space-y-3 pt-1 text-xs">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-extrabold text-emerald-700 uppercase block mb-1">
                  Gatillo de Inicio
                </span>
                <p className="text-slate-700 font-medium">
                  {process?.asIsContext || 'Recepción de requerimiento formal o evento de gatillo para iniciar el flujo operativo.'}
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-extrabold text-indigo-700 uppercase block mb-1">
                  Estado de Finalización
                </span>
                <p className="text-slate-700 font-medium">
                  {process?.toBeOptimizations || 'Entrega de producto/servicio conforme y registro final en sistema SGD.'}
                </p>
              </div>
            </div>
          </div>

          {/* 2.2 Descripción General del Proceso */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
                <FileText size={16} className="text-indigo-600" />
                2.2. Descripción General del Proceso
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white p-4 rounded-xl border border-slate-200/80">
                {process?.description || 'Proceso estándar para la recepción, control de calidad, almacenamiento e inventario de materias primas e insumos médicos.'}
              </p>
            </div>

            <div className="pt-3 text-[11px] text-slate-500 font-medium flex items-center justify-between border-t border-slate-200/60 mt-4">
              <span>Alineación Estándar:</span>
              <span className="font-bold text-slate-800">ISO 9001 / BPMN 2.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: FICHA DESCRIPTIVA DEL PROCESO */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
            3
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              3. Ficha Descriptiva del Proceso
            </h2>
            <p className="text-xs text-slate-500">Matriz detallada de gobernanza, entradas, salidas, actores y riesgos.</p>
          </div>
        </div>

        {/* Descriptive Grid Table */}
        <div className="overflow-hidden border border-slate-200 rounded-2xl shadow-xs">
          <table className="w-full text-xs text-left">
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-slate-50">
                <td className="p-3.5 font-bold text-slate-700 w-1/3 bg-slate-100/70">Nombre del Proceso</td>
                <td className="p-3.5 font-extrabold text-slate-900">{process?.name || microprocessName || 'Microproceso Seleccionado'}</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-700 bg-slate-50/70">Responsable del Proceso</td>
                <td className="p-3.5 text-slate-800 font-medium">{process?.docAuthor || 'No especificado'}</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-3.5 font-bold text-slate-700 bg-slate-100/70">Dueño del Proceso</td>
                <td className="p-3.5 text-slate-800 font-medium">{process?.project ? `Subdirección / ${process.project}` : 'No especificado'}</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-700 bg-slate-50/70">Entradas del Proceso</td>
                <td className="p-3.5 text-slate-800 font-medium">{process?.asIsContext || 'No especificado'}</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-3.5 font-bold text-slate-700 bg-slate-100/70">Resultados / Entregables</td>
                <td className="p-3.5 text-slate-800 font-medium">{process?.toBeOptimizations || process?.docFileName || 'No especificado'}</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-700 bg-slate-50/70">Proveedores / Relaciones</td>
                <td className="p-3.5 text-slate-800 font-medium">{process?.suppliers || 'Unidades y proveedores según flujo de proceso'}</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-3.5 font-bold text-slate-700 bg-slate-100/70">Usuarios / Destinatarios</td>
                <td className="p-3.5 text-slate-800 font-medium">{process?.customers || 'Usuarios y beneficiarios institucionales'}</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-700 bg-slate-50/70">Riesgos Identificados</td>
                <td className="p-3.5 text-slate-800">
                  <ul className="space-y-1 list-disc pl-4 text-slate-700">
                    {process?.governanceRules && process.governanceRules.length > 0 ? (
                      process.governanceRules.map((gov, i) => (
                        <li key={i}>{gov.title}: {gov.description}</li>
                      ))
                    ) : (
                      <li className="text-slate-400 italic">Sin riesgos específicos registrados en el archivo.</li>
                    )}
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3.4 Modelo Descriptivo (Matriz de Transiciones y Roles) */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Shield size={16} className="text-indigo-600" />
            3.4. Modelo Descriptivo (Matriz de Transiciones y Roles)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Estados Oficiales del Proceso */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Estados Oficiales del Proceso
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Draft', color: 'bg-slate-200 text-slate-800' },
                  { name: 'En_Revision', color: 'bg-amber-100 text-amber-900 border border-amber-300' },
                  { name: 'Aprobado_Calidad', color: 'bg-blue-100 text-blue-900 border border-blue-300' },
                  { name: 'Ejecutado_SGD', color: 'bg-emerald-100 text-emerald-900 border border-emerald-300' }
                ].map((st, idx) => (
                  <span key={idx} className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${st.color}`}>
                    {st.name}
                  </span>
                ))}
              </div>
            </div>

            {/* SLA y Escalación Operativa */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                SLA y Escalación Operativa
              </span>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                  <span className="font-bold text-amber-800">[SLA En_Revisión]</span>{' '}
                  <span className="text-slate-600">Límite: 24h. Notificación de alerta por correo al revisor asignado.</span>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                  <span className="font-bold text-rose-800">[SLA Escalación]</span>{' '}
                  <span className="text-slate-600">Límite: 48h. Escalamiento automático a Jefatura de Área.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3.5 Ficha de Subprocesos (Matriz SIPOC) */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ListChecks size={16} className="text-indigo-600" />
            3.5. Ficha de Subprocesos (Matriz SIPOC)
          </h3>

          {sipocRows.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider">
                    <th className="p-3">S (Proveedor)</th>
                    <th className="p-3">I (Insumo)</th>
                    <th className="p-3">P (Subproceso)</th>
                    <th className="p-3">O (Entregable)</th>
                    <th className="p-3">C (Usuario Final)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {sipocRows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="p-3 font-semibold text-slate-800">{row.supplier}</td>
                      <td className="p-3 text-slate-700">{row.input}</td>
                      <td className="p-3 font-bold text-indigo-700">{row.processName}</td>
                      <td className="p-3 text-slate-700">{row.output}</td>
                      <td className="p-3 font-medium text-slate-800">{row.customer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center text-xs text-slate-500">
              No hay registros en la matriz SIPOC para {microprocessName || 'este microproceso'}. Sube un archivo a UpEngine para cargar la matriz automáticamente.
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4: DESCRIPCIÓN DEL PROCEDIMIENTO MODELO DE NIVEL OPERATIVO */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
              4
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  4. DESCRIPCIÓN DEL PROCEDIMIENTO MODELO DE NIVEL OPERATIVO
                </h2>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-black rounded-md uppercase">
                  BPMN 2.0 & FCE
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Subprocesos (Sustantivos abstractos Ref. 3.3.2) y Actividades Operativas TO-BE (Verbos infinitivos Ref. 2.2).
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => toggleExpandAll(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              Expandir Todos
            </button>
            <button
              onClick={() => toggleExpandAll(false)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              Colapsar Todos
            </button>
            <button
              onClick={() => setIsAddingSubprocess(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
            >
              <Plus size={14} />
              <span>Agregar Subproceso</span>
            </button>
          </div>
        </div>

        {/* Modal / Inline Add Subprocess Form */}
        {isAddingSubprocess && (
          <div className="p-4 bg-indigo-50/80 rounded-2xl border border-indigo-200 space-y-3 animate-fadeIn">
            <span className="text-xs font-bold text-indigo-900 block">Nuevo Subproceso Operativo</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre del subproceso (Ej: Verificación y Control de Calidad)..."
                value={newSubprocessName}
                onChange={(e) => setNewSubprocessName(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleAddSubprocess}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all"
              >
                Guardar
              </button>
              <button
                onClick={() => setIsAddingSubprocess(false)}
                className="px-3 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-300 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Subprocesses Accordion List */}
        {subprocesses.length > 0 ? (
          <div className="space-y-4">
            {subprocesses.map((sp) => {
              const isExpanded = !!expandedSubprocesses[sp.id];
              return (
                <div
                  key={sp.id}
                  className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/40 hover:border-slate-300 transition-all shadow-2xs"
                >
                  {/* Subprocess Accordion Bar */}
                  <div className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                        {sp.code}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{sp.name}</h3>
                        <span className="text-[11px] font-medium text-slate-500">
                          ({sp.activities.length} actividades operativas)
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => toggleSubprocess(sp.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{isExpanded ? 'Colapsar' : 'Expandir'}</span>
                      </button>

                      <button
                        onClick={() => {
                          const newName = prompt('Nuevo nombre para el subproceso:', sp.name);
                          if (newName) {
                            setSubprocesses(
                              subprocesses.map((s) => (s.id === sp.id ? { ...s, name: newName } : s))
                            );
                          }
                        }}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
                        title="Editar Subproceso"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        onClick={() => handleDeleteSubprocess(sp.id)}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                        title="Eliminar Subproceso"
                      >
                        <Trash2 size={14} />
                      </button>

                      <button
                        onClick={() => setAddingActivityToId(sp.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-all border border-indigo-100 cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Actividad</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Activities List */}
                  {isExpanded && (
                    <div className="p-5 bg-slate-50/70 space-y-3">
                      {/* Add Activity Inline Form */}
                      {addingActivityToId === sp.id && (
                        <div className="flex gap-2 p-3 bg-white rounded-xl border border-indigo-200 shadow-xs mb-3">
                          <input
                            type="text"
                            placeholder="Escriba la actividad TO-BE en verbo infinitivo..."
                            value={newActivityText}
                            onChange={(e) => setNewActivityText(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={() => handleAddActivity(sp.id)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                          >
                            Añadir
                          </button>
                          <button
                            onClick={() => setAddingActivityToId(null)}
                            className="px-2 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-bold cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}

                      <div className="space-y-2">
                        {sp.activities.map((act, aIdx) => (
                          <div
                            key={aIdx}
                            className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-start justify-between gap-3 text-xs text-slate-800 font-medium hover:border-indigo-200 transition-all"
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                {aIdx + 1}
                              </span>
                              <span className="leading-relaxed">{act}</span>
                            </div>

                            <button
                              onClick={() => handleDeleteActivity(sp.id, aIdx)}
                              className="p-1 text-slate-300 hover:text-rose-500 rounded transition-all shrink-0 cursor-pointer"
                              title="Eliminar Actividad"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-8 text-center space-y-3">
            <ListChecks className="mx-auto text-slate-400" size={28} />
            <p className="text-xs font-bold text-slate-800">No hay subprocesos o actividades registradas</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              No se han registrado subprocesos para {microprocessName || 'este microproceso'}. Puedes subir un archivo a UpEngine para cargarlos automáticamente o agregar subprocesos con el botón superior.
            </p>
            {onOpenUploadModal && (
              <div className="pt-1">
                <button
                  onClick={onOpenUploadModal}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <FileUp size={14} />
                  <span>Subir Archivo a UpEngine</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
};

export default ProcessSpecificationManual;
