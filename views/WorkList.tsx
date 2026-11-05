
import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  DocumentService, HierarchyService, 
  formatVersionForDisplay, getStatusInfo, DEFAULT_EXECUTIVE_DEADLINE 
} from '../services/firebaseBackend';
import { Document, User, DocState, UserRole, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
  Filter, ArrowRight, Calendar, ListTodo, Activity, FileText, 
  Search, ArrowUp, ArrowDown, ArrowUpDown, X, AlertTriangle, 
  Layers, Network, FolderTree, ChevronDown, RotateCcw,
  BookOpen, Sparkles, Target, ShieldCheck, ChevronUp
} from 'lucide-react';

interface Props {
  user: User;
}

type SortOption = 'microprocess' | 'state' | 'updatedAt' | 'default';

const reviewStates = [
    DocState.INTERNAL_REVIEW, 
    DocState.SENT_TO_REFERENT, 
    DocState.REFERENT_REVIEW, 
    DocState.SENT_TO_CONTROL, 
    DocState.CONTROL_REVIEW
];

const WorkList: React.FC<Props> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de Búsqueda
  const [filterProject, setFilterProject] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterState, setFilterState] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Ordenamiento
  const [sortConfig, setSortConfig] = useState<{ key: SortOption; direction: 'asc' | 'desc' }>({
    key: 'default',
    direction: 'desc'
  });
  const [showMethodologyGuide, setShowMethodologyGuide] = useState(false);

  useEffect(() => {
    loadData();
  }, [user.id]);

  const normalize = (str: string | undefined) => {
      if (!str) return '';
      return str.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const loadData = async () => {
    setLoading(true);
    try {
        const [realDocsData, hierarchy] = await Promise.all([
            DocumentService.getAll(),
            HierarchyService.getFullHierarchy()
        ]);
        
        const realDocMap = new Map<string, Document>();
        realDocsData.forEach(doc => {
            if (doc.project && (doc.microprocess || doc.title)) {
                const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
                const docType = doc.docType || 'AS IS';
                const key = `${normalize(doc.project)}|${normalize(microName)}|${normalize(docType)}`;
                
                const existing = realDocMap.get(key);
                if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                    realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
                }
            }
        });

        const myWorkList: Document[] = [];
        const hierarchyKeys = Object.keys(hierarchy);
        const roleUpper = (user.role || '').toString().toUpperCase();
        const isCoordOrAdmin = roleUpper === 'ADMIN' || roleUpper === 'COORDINATOR' || roleUpper === 'COORDINADOR';
        
        hierarchyKeys.forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    const nodes = hierarchy[proj][macro][proc];
                    nodes.forEach(node => {
                        if (node.active === false) return; 

                        const requiredTypes = (node.requiredTypes && node.requiredTypes.length > 0) 
                            ? node.requiredTypes 
                            : ['AS IS', 'FCE', 'PM', 'TO BE'];

                        requiredTypes.forEach(type => {
                            const key = `${normalize(proj)}|${normalize(node.name)}|${normalize(type)}`;
                            
                            if (realDocMap.has(key)) {
                                const realDoc = realDocMap.get(key)!;
                                const isAssigned = node.assignees && node.assignees.includes(user.id);
                                const isPendingRequest = isCoordOrAdmin && realDoc.hasPendingRequest;

                                if (((isAssigned && !isCoordOrAdmin) || isPendingRequest) && realDoc.state !== DocState.APPROVED) {
                                    myWorkList.push({
                                        ...realDoc,
                                        macroprocess: macro,
                                        process: proc,
                                        project: proj,
                                        assignees: node.assignees
                                    });
                                }
                            } else {
                                const isAssigned = node.assignees && node.assignees.includes(user.id);
                                if (isAssigned && !isCoordOrAdmin) {
                                    myWorkList.push({
                                        id: `virtual-${key}-${Date.now()}`,
                                        title: `${node.name} - ${type}`,
                                        description: 'Pendiente de inicio',
                                        project: proj,
                                        macroprocess: macro,
                                        process: proc,
                                        microprocess: node.name,
                                        docType: type as DocType,
                                        authorId: '',
                                        authorName: '',
                                        assignedTo: user.id,
                                        assignees: node.assignees,
                                        state: DocState.NOT_STARTED,
                                        version: '-',
                                        progress: 0,
                                        files: [],
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date(0).toISOString(), 
                                        hasPendingRequest: false
                                    });
                                }
                            }
                        });
                    });
                });
            });
        });

        setDocs(myWorkList);
    } catch (error) {
        console.error("Error loading work list:", error);
    } finally {
        setLoading(false);
    }
  };

  const availableProjects = useMemo(() => Array.from(new Set(docs.map(d => d.project).filter(Boolean))).sort(), [docs]);
  const availableMacros = useMemo(() => {
    let list = docs;
    if (filterProject) list = list.filter(d => d.project === filterProject);
    return Array.from(new Set(list.map(d => d.macroprocess).filter(Boolean))).sort();
  }, [docs, filterProject]);
  const availableProcesses = useMemo(() => {
    let list = docs;
    if (filterProject) list = list.filter(d => d.project === filterProject);
    if (filterMacro) list = list.filter(d => d.macroprocess === filterMacro);
    return Array.from(new Set(list.map(d => d.process).filter(Boolean))).sort();
  }, [docs, filterProject, filterMacro]);

  const processedDocs = useMemo(() => {
      let filtered = [...docs];
      if (filterProject) filtered = filtered.filter(d => d.project === filterProject);
      if (filterMacro) filtered = filtered.filter(d => d.macroprocess === filterMacro);
      if (filterProcess) filtered = filtered.filter(d => d.process === filterProcess);
      if (filterState) filtered = filtered.filter(d => d.state === filterState);
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          filtered = filtered.filter(d => 
              (d.project || '').toLowerCase().includes(lowerTerm) ||
              (d.microprocess || '').toLowerCase().includes(lowerTerm) ||
              (d.title || '').toLowerCase().includes(lowerTerm)
          );
      }
      return filtered.sort((a, b) => {
          if (sortConfig.key === 'default') {
              // 1. Prioridad Máxima: Solicitudes Pendientes (Alerta Roja)
              if (a.hasPendingRequest !== b.hasPendingRequest) {
                  return a.hasPendingRequest ? -1 : 1;
              }

              // 2. Prioridad Media: Estados de Revisión/Seguimiento
              const aIsReview = reviewStates.includes(a.state);
              const bIsReview = reviewStates.includes(b.state);
              if (aIsReview !== bIsReview) {
                  return aIsReview ? -1 : 1;
              }
              
              // 3. Dentro de cada grupo:
              // Si es Prioritario (Solicitud o Revisión) -> Antiguo a Reciente (ASC) para no olvidar lo rezagado
              if (a.hasPendingRequest || aIsReview) {
                  return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
              }
              
              // Si no es prioritario -> Reciente a Antiguo (DESC)
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          }

          const modifier = sortConfig.direction === 'asc' ? 1 : -1;
          switch (sortConfig.key) {
              case 'microprocess': return (a.microprocess || '').localeCompare(b.microprocess || '') * modifier;
              case 'state': return ((STATE_CONFIG[a.state]?.progress || 0) - (STATE_CONFIG[b.state]?.progress || 0)) * modifier;
              case 'updatedAt': return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * modifier;
              default: return 0;
          }
      });
  }, [docs, filterProject, filterMacro, filterProcess, filterState, searchTerm, sortConfig]);

  const handleSort = (key: SortOption) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
      setSortConfig({ key, direction });
  };

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Activity className="animate-spin mb-2" />Cargando lista de trabajo...</div>;

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <ListTodo className="text-indigo-600" size={28} />
                Lista de Trabajo
            </h1>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-tight">
                Revisiones y asignaciones pendientes.
            </p>
        </div>
        <button
          onClick={() => setShowMethodologyGuide(!showMethodologyGuide)}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-xs ${
            showMethodologyGuide 
              ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
              : 'bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-200'
          }`}
          title="Ver explicación de la forma de trabajo y los 4 documentos obligatorios por proceso"
        >
          <BookOpen size={16} />
          <span>{showMethodologyGuide ? 'Ocultar Metodología' : 'Metodología & Documentos'}</span>
        </button>
      </div>

      {/* GUÍA METODOLÓGICA DEL ANALISTA */}
      {showMethodologyGuide && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-lg border border-indigo-800/40 p-6 space-y-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 border border-indigo-400/40 flex items-center justify-center text-white shadow-inner flex-shrink-0">
                <BookOpen size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-tight">Forma de Trabajo del Analista y Documentos Obligatorios</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    Estándar SGD
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 font-medium">
                  Ciclo metodológico integral y los 4 documentos requeridos que debe generar por cada proceso asignado.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowMethodologyGuide(false)}
              className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/20 flex items-center gap-1.5 transition-all"
            >
              <ChevronUp size={14} />
              Ocultar
            </button>
          </div>

          {/* PARTE 1: EXPLICACIÓN DE LA FORMA DE TRABAJO */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-300 font-black text-xs uppercase tracking-wider">
              <Sparkles size={14} className="text-indigo-400" />
              1. Explicación de la Forma de Trabajo del Analista
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Como analista, usted recibe la asignación de microprocesos dentro de la jerarquía (<strong className="text-white">Proyecto → Macroproceso → Proceso → Microproceso</strong>). Su función consiste en relevar la situación actual de cada proceso con los referentes institucionales, identificar cuellos de botella y riesgos operativos, proponer soluciones de rediseño y estandarización, y modelar el flujo de trabajo futuro optimizado, gestionando cada informe a través del flujo formal de versiones y aprobaciones.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-indigo-400 font-mono text-[11px] font-bold">
                  <span>ETAPA 1</span>
                  <FolderTree size={14} />
                </div>
                <h4 className="text-xs font-bold text-white">Asignación & Alcance</h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Revisar los microprocesos en esta lista, delimitar el alcance y coordinar entrevistas con los referentes del servicio.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-indigo-400 font-mono text-[11px] font-bold">
                  <span>ETAPA 2</span>
                  <Target size={14} />
                </div>
                <h4 className="text-xs font-bold text-white">Levantamiento & FCE</h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Recopilar normativas, registrar el flujo real vigente y definir los puntos y factores críticos de éxito indispensables.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-indigo-400 font-mono text-[11px] font-bold">
                  <span>ETAPA 3</span>
                  <Sparkles size={14} />
                </div>
                <h4 className="text-xs font-bold text-white">Propuesta de Mejora (PM)</h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Identificar ineficiencias, simplificar tareas redundantes y diseñar el modelo futuro optimizado (TO BE).
                </p>
              </div>

              <div className="bg-white/5 border border-emerald-400 font-mono text-[11px] font-bold">
                <div className="flex items-center justify-between text-emerald-400 font-mono text-[11px] font-bold">
                  <span>ETAPA 4</span>
                  <ShieldCheck size={14} />
                </div>
                <h4 className="text-xs font-bold text-white">Circuito de Aprobación</h4>
                <p className="text-[11px] text-slate-300 leading-normal font-sans">
                  Envío a Revisión Interna (Coordinador) → Revisión Referente → Control de Gestión → Aprobación Final (100%).
                </p>
              </div>
            </div>
          </div>

          {/* PARTE 2: ENUMERACIÓN DE DOCUMENTOS POR PROCESO */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-indigo-300 font-black text-xs uppercase tracking-wider">
                <FileText size={14} className="text-indigo-400" />
                2. Enumeración de Documentos que cada Analista debe Generar por Proceso Asignado
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                4 Entregables Técnicos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* 1. AS IS */}
              <div className="bg-white/5 border border-indigo-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      1. AS IS
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Estado Actual</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Levantamiento de Proceso Actual</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                    Diagnóstico fidedigno del estado operacional vigente, modelando cómo opera hoy la institución sin filtros preliminares.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-slate-400 space-y-1">
                    <div><strong className="text-slate-300">Entregables:</strong> Diagrama actual, actores, tareas, entradas, salidas y puntos de dolor.</div>
                    <div><strong className="text-slate-300">Nomenclatura:</strong> <code className="text-indigo-300 font-mono text-[9px]">[PROY] - [Micro] - AS IS - v0.1</code></div>
                  </div>
                </div>
              </div>

              {/* 2. FCE */}
              <div className="bg-white/5 border border-amber-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      2. FCE
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Factores Clave</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Factores Críticos de Éxito</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                    Variables técnicas, operacionales y normativas esenciales cuya satisfacción asegura el éxito y estabilidad del proceso.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-slate-400 space-y-1">
                    <div><strong className="text-slate-300">Entregables:</strong> Puntos críticos de control, variables de riesgo, métricas y tiempos máximos.</div>
                    <div><strong className="text-slate-300">Nomenclatura:</strong> <code className="text-amber-300 font-mono text-[9px]">[PROY] - [Micro] - FCE - v0.1</code></div>
                  </div>
                </div>
              </div>

              {/* 3. PM */}
              <div className="bg-white/5 border border-emerald-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      3. PM
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Optimización</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Propuesta de Mejora</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                    Análisis técnico de oportunidades de optimización para eliminar duplicidades, burocracia innecesaria y cuellos de botella.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-slate-400 space-y-1">
                    <div><strong className="text-slate-300">Entregables:</strong> Matriz de mejoras, alternativas evaluadas y plan de rediseño justificado.</div>
                    <div><strong className="text-slate-300">Nomenclatura:</strong> <code className="text-emerald-300 font-mono text-[9px]">[PROY] - [Micro] - PM - v0.1</code></div>
                  </div>
                </div>
              </div>

              {/* 4. TO BE */}
              <div className="bg-white/5 border border-blue-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      4. TO BE
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Estado Futuro</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Diseño del Proceso Futuro</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                    Diseño formal y estandarizado del nuevo proceso operativo optimizado que adoptará oficialmente la institución.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-slate-400 space-y-1">
                    <div><strong className="text-slate-300">Entregables:</strong> Diagrama futuro rediseñado, reglas de negocio, directrices de automatización y KPIs.</div>
                    <div><strong className="text-slate-300">Nomenclatura:</strong> <code className="text-blue-300 font-mono text-[9px]">[PROY] - [Micro] - TO BE - v0.1</code></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FILTROS DE BÚSQUEDA - Estilo Imagen de Referencia */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.15em]">
            <Filter size={14} /> FILTROS DE BÚSQUEDA
          </div>
          {sortConfig.key !== 'default' && (
            <button 
              onClick={() => setSortConfig({ key: 'default', direction: 'desc' })}
              className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 font-black text-[9px] uppercase tracking-widest transition-all group"
            >
              <RotateCcw size={12} className="group-hover:rotate-[-45deg] transition-transform" /> 
              Restablecer Orden Inteligente
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative">
              <FolderTree className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterProject} 
                onChange={(e) => { setFilterProject(e.target.value); setFilterMacro(''); setFilterProcess(''); }}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">PROYECTO</option>
                {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterMacro} 
                onChange={(e) => { setFilterMacro(e.target.value); setFilterProcess(''); }}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">MACROPROCESO</option>
                {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Network className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterProcess} 
                onChange={(e) => setFilterProcess(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">PROCESO</option>
                {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterState} 
                onChange={(e) => setFilterState(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">ESTADO</option>
                {Object.keys(STATE_CONFIG).filter(k => k !== DocState.APPROVED).map(key => (
                    <option key={key} value={key}>{STATE_CONFIG[key as DocState].label.split('(')[0]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="BUSCAR..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none shadow-sm placeholder:text-slate-300"
              />
            </div>
        </div>
      </div>

      {/* TABLA - Diseño de nivel único con Estética Dashboard en Columna Estado */}
      <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/20 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] border-b border-slate-100">
                <th className="px-6 py-5">PROYECTO / MACRO</th>
                <th className="px-6 py-5">MICROPROCESO</th>
                <th className="px-6 py-5">DOCUMENTO</th>
                <th className="px-6 py-5">ESTADO ACTUAL</th>
                <th className="px-6 py-5 cursor-pointer group" onClick={() => handleSort('updatedAt')}>
                  <div className="flex items-center gap-1">
                    FECHA 
                    {sortConfig.key === 'updatedAt' ? (
                      sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-indigo-600" /> : <ArrowDown size={10} className="text-indigo-600" />
                    ) : <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-100" />}
                  </div>
                </th>
                <th className="px-6 py-5 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {processedDocs.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-300 font-bold italic uppercase tracking-widest">No hay tareas pendientes en este contexto</td></tr>
              ) : (
                processedDocs.map((doc, idx) => {
                  const stateInfo = STATE_CONFIG[doc.state];
                  return (
                    <tr key={`${doc.id}-${idx}`} className="group hover:bg-slate-50/50 transition-all">
                      <td className="px-6 py-5">
                        <div className="text-[11px] font-black text-slate-800 uppercase tracking-tighter mb-0.5">{doc.project}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate max-w-[180px]">{doc.macroprocess}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-[11px] font-black text-slate-700 uppercase tracking-tight">
                          {doc.microprocess || 'General'}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <FileText size={18} className="text-slate-300" />
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm">
                              {doc.docType || 'AS IS'}
                            </span>
                            {doc.hasPendingRequest && (
                              <span className="flex items-center gap-1 text-[9px] font-black text-red-600 px-2 py-0.5 rounded border border-red-200 bg-red-50 animate-pulse">
                                <AlertTriangle size={10} /> SOLICITUD
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* ESTADO ACTUAL - Estética Dashboard */}
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                            <div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit mb-1 ${stateInfo.color}`}>
                                {stateInfo.label.split('(')[0].trim()}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 font-bold">
                                {formatVersionForDisplay(doc.version)} ({stateInfo.progress}%)
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-slate-500 font-bold text-[10px]">
                          <Calendar size={12} className="text-slate-300" />
                          <span>{doc.state === DocState.NOT_STARTED ? '-' : new Date(doc.updatedAt).toLocaleDateString('es-CL')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link 
                          to={`/doc/${doc.id}`} 
                          state={{ docData: doc }}
                          className="text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-[0.1em] inline-flex items-center gap-2 group/link transition-all"
                        >
                          Ver Detalle 
                          <ArrowRight size={14} className="group-hover/link:translate-x-1 transition-transform" />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkList;
