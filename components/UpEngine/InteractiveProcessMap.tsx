import React, { useState, useMemo } from 'react';
import { FullHierarchy, Document } from '../../types';
import { SavedProcessEntry } from '../../types/upEngine';
import { normalizeHeader } from '../../services/firebaseBackend';
import {
  Network, Layers, GitMerge,
  ChevronDown, ChevronUp, Search,
  ArrowRight, Check, Maximize2, Minimize2,
  FileUp, FileText, Sparkles
} from 'lucide-react';

interface Props {
  hierarchy: FullHierarchy;
  documents: Document[];
  processes?: SavedProcessEntry[];
  selectedProject: string;
  selectedMacro: string;
  selectedProcess: string;
  selectedMicro: string;
  onSelectNode: (project: string, macro?: string, process?: string, micro?: string) => void;
}

export const InteractiveProcessMap: React.FC<Props> = ({
  hierarchy,
  documents,
  processes = [],
  selectedProject,
  selectedMacro,
  selectedProcess,
  selectedMicro,
  onSelectNode,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [upEngineFilter, setUpEngineFilter] = useState<'ALL' | 'UPLOADED' | 'PENDING'>('ALL');
  const [expandedMacros, setExpandedMacros] = useState<Record<string, boolean>>({});
  const [expandedProcs, setExpandedProcs] = useState<Record<string, boolean>>({});

  const projects = useMemo(() => Object.keys(hierarchy), [hierarchy]);

  // Document status lookup map by microprocess name (normalized) from SGD
  const docStatusMap = useMemo(() => {
    const map: Record<string, { toBe: boolean; fce: boolean; state?: string }> = {};
    documents.forEach((doc) => {
      if (!doc.project || doc.project !== selectedProject) return;
      const microName = normalizeHeader(doc.microprocess || doc.title.split(' - ')[0] || '');
      if (!microName) return;

      if (!map[microName]) {
        map[microName] = { toBe: false, fce: false, state: doc.state };
      }
      if (doc.docType === 'TO BE') map[microName].toBe = true;
      if (doc.docType === 'FCE') map[microName].fce = true;
    });
    return map;
  }, [documents, selectedProject]);

  // UpEngine upload status lookup map by microprocess name
  const upEngineMap = useMemo(() => {
    const map: Record<string, { hasFile: boolean; fileName?: string; savedAt?: string }> = {};
    if (!processes) return map;

    processes.forEach((p) => {
      const micro = p.process?.microprocess || p.process?.name;
      if (!micro) return;
      const normMicro = normalizeHeader(micro);

      if (p.process?.project && p.process.project !== selectedProject) return;

      const hasFile = !!(p.process?.docFileName || p.process?.docFileUrl || (p.process?.stages && p.process.stages.length > 0));
      map[normMicro] = {
        hasFile,
        fileName: p.process?.docFileName,
        savedAt: p.savedAt
      };
    });
    return map;
  }, [processes, selectedProject]);

  const activeProjectHierarchy = hierarchy[selectedProject] || {};
  const macros = Object.keys(activeProjectHierarchy);

  // Calculate totals
  const totals = useMemo(() => {
    let macroCount = macros.length;
    let procCount = 0;
    let microCount = 0;
    let upEngineCount = 0;

    macros.forEach((m) => {
      const procs = Object.keys(activeProjectHierarchy[m] || {});
      procCount += procs.length;
      procs.forEach((p) => {
        const micros = activeProjectHierarchy[m][p] || [];
        microCount += micros.length;
        micros.forEach((microNode) => {
          const normMicro = normalizeHeader(microNode.name);
          if (upEngineMap[normMicro]?.hasFile) {
            upEngineCount++;
          }
        });
      });
    });

    return { macroCount, procCount, microCount, upEngineCount };
  }, [activeProjectHierarchy, macros, upEngineMap]);

  const toggleMacroExpand = (macroName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedMacros((prev) => ({
      ...prev,
      [macroName]: !prev[macroName],
    }));
  };

  const toggleProcExpand = (procKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedProcs((prev) => ({
      ...prev,
      [procKey]: !prev[procKey],
    }));
  };

  const handleExpandAll = () => {
    const allM: Record<string, boolean> = {};
    const allP: Record<string, boolean> = {};
    macros.forEach((m) => {
      allM[m] = true;
      const procs = Object.keys(activeProjectHierarchy[m] || {});
      procs.forEach((p) => {
        allP[`${m}__${p}`] = true;
      });
    });
    setExpandedMacros(allM);
    setExpandedProcs(allP);
  };

  const handleCollapseAll = () => {
    setExpandedMacros({});
    setExpandedProcs({});
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all">
      {/* Top Bar Header */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/90 border border-indigo-400/30 text-white flex items-center justify-center shadow-inner shrink-0">
            <Network size={22} className="text-indigo-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-tight text-white uppercase">
                Mapa de Procesos Interactivo
              </h3>
              <span className="px-2.5 py-0.5 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[10px] font-black uppercase rounded-full">
                Soporte a Filtros
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Navegue visualmente por la estructura normativo-operativa. Haga clic en cualquier nivel para aplicarlo a los filtros del motor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Quick Metrics Badges */}
          <div className="hidden lg:flex items-center gap-2.5 text-[11px] font-extrabold text-slate-300 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10">
            <span><strong className="text-indigo-300 font-black">{totals.macroCount}</strong> Macros</span>
            <span className="text-slate-500">•</span>
            <span><strong className="text-indigo-300 font-black">{totals.procCount}</strong> Procesos</span>
            <span className="text-slate-500">•</span>
            <span><strong className="text-slate-200 font-black">{totals.microCount}</strong> Microprocesos</span>
            <span className="text-slate-500">•</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/30 text-purple-200 border border-purple-400/30 font-black flex items-center gap-1.5 shadow-xs">
              <FileUp size={12} className="text-purple-300" />
              <span>{totals.upEngineCount} / {totals.microCount} Subidos UpEngine</span>
            </span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/10 cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={15} />
                <span>Ocultar Mapa</span>
              </>
            ) : (
              <>
                <ChevronDown size={15} />
                <span>Ver Mapa</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Project Tabs & UpEngine Filter & Search Bar */}
      {isExpanded && (
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left side: Project selector & UpEngine Status filter */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Project selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1">
                Proyecto:
              </span>
              {projects.map((proj) => {
                const isSelected = proj === selectedProject;
                return (
                  <button
                    key={proj}
                    onClick={() => onSelectNode(proj)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/20 ring-2 ring-indigo-500/20'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    {proj}
                  </button>
                );
              })}
            </div>

            <span className="hidden sm:inline text-slate-300">|</span>

            {/* UpEngine Status Filter selector */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 text-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-1">
                Ver:
              </span>
              <button
                onClick={() => setUpEngineFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer ${
                  upEngineFilter === 'ALL'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Todos ({totals.microCount})
              </button>
              <button
                onClick={() => {
                  setUpEngineFilter('UPLOADED');
                  handleExpandAll();
                }}
                className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                  upEngineFilter === 'UPLOADED'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-700 bg-purple-50/80 hover:bg-purple-100'
                }`}
              >
                <FileUp size={12} />
                <span>Solo Subidos ({totals.upEngineCount})</span>
              </button>
              <button
                onClick={() => {
                  setUpEngineFilter('PENDING');
                  handleExpandAll();
                }}
                className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer ${
                  upEngineFilter === 'PENDING'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <span>Pendientes ({totals.microCount - totals.upEngineCount})</span>
              </button>
            </div>
          </div>

          {/* Search box & Expand/Collapse All Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[180px]">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar proceso o micro..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5 text-slate-600 text-[11px]">
              <button
                onClick={handleExpandAll}
                title="Expandir todos los macroprocesos y procesos"
                className="flex items-center gap-1 px-2.5 py-1 hover:bg-slate-100 rounded-lg font-bold transition-all cursor-pointer"
              >
                <Maximize2 size={12} />
                <span className="hidden md:inline">Expandir</span>
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={handleCollapseAll}
                title="Contraer todos los macroprocesos"
                className="flex items-center gap-1 px-2.5 py-1 hover:bg-slate-100 rounded-lg font-bold transition-all cursor-pointer"
              >
                <Minimize2 size={12} />
                <span className="hidden md:inline">Contraer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Process Map Grid (Macroprocesos collapsed by default) */}
      {isExpanded && (
        <div className="p-5 space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar bg-slate-50/50">
          {macros.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">
              No se encontraron macroprocesos definidos para el proyecto seleccionado.
            </div>
          ) : (
            macros.map((macroName) => {
              const isMacroSelected = selectedMacro === macroName;
              const processesInMacro = activeProjectHierarchy[macroName] || {};
              const procKeys = Object.keys(processesInMacro);

              // Filter procKeys that have matching microprocesses under upEngineFilter
              const filteredProcKeys = procKeys.filter((procName) => {
                const micros = processesInMacro[procName] || [];
                return micros.some((m) => {
                  const normMicro = normalizeHeader(m.name);
                  const hasFile = !!upEngineMap[normMicro]?.hasFile;
                  if (upEngineFilter === 'UPLOADED') return hasFile;
                  if (upEngineFilter === 'PENDING') return !hasFile;
                  return true;
                });
              });

              if (upEngineFilter !== 'ALL' && filteredProcKeys.length === 0) {
                return null;
              }

              const hasSearch = searchQuery.trim().length > 0;
              // Expand automatically if search match or if explicitly expanded
              const isMacroOpen = hasSearch || !!expandedMacros[macroName];

              // Filter check for search query
              if (hasSearch) {
                const query = searchQuery.toLowerCase();
                const matchesMacro = macroName.toLowerCase().includes(query);
                const matchesAnyProc = procKeys.some((p) => {
                  if (p.toLowerCase().includes(query)) return true;
                  const micros = processesInMacro[p] || [];
                  return micros.some((m) => m.name.toLowerCase().includes(query));
                });
                if (!matchesMacro && !matchesAnyProc) return null;
              }

              return (
                <div
                  key={macroName}
                  className={`rounded-2xl border transition-all ${
                    isMacroSelected
                      ? 'bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-300/50'
                      : 'bg-white border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  {/* Macroprocess Header Bar */}
                  <div
                    onClick={() => {
                      onSelectNode(selectedProject, macroName);
                      if (!isMacroOpen) {
                        toggleMacroExpand(macroName);
                      }
                    }}
                    className={`p-3.5 px-4 rounded-2xl flex items-center justify-between cursor-pointer transition-colors ${
                      isMacroSelected
                        ? 'bg-gradient-to-r from-indigo-50/90 to-indigo-100/40 text-indigo-950'
                        : 'bg-slate-100/60 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                          isMacroSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        <Layers size={14} />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest block">
                          Macroproceso
                        </span>
                        <h4 className="text-xs font-black tracking-tight flex items-center gap-2">
                          {macroName}
                          {isMacroSelected && (
                            <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-extrabold uppercase rounded-full">
                              Seleccionado
                            </span>
                          )}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-slate-500 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200">
                        {filteredProcKeys.length} procesos
                      </span>

                      <button
                        type="button"
                        onClick={(e) => toggleMacroExpand(macroName, e)}
                        className="p-1.5 rounded-lg bg-white/80 hover:bg-indigo-100 border border-slate-200 text-slate-600 hover:text-indigo-700 transition-all cursor-pointer"
                        title={isMacroOpen ? 'Contraer Macroproceso' : 'Expandir Macroproceso'}
                      >
                        {isMacroOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Processes Grid inside Macroproceso (shown when expanded) */}
                  {isMacroOpen && (
                    <div className="p-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-50/30">
                      {filteredProcKeys.map((procName) => {
                        const procKey = `${macroName}__${procName}`;
                        const isProcSelected = isMacroSelected && selectedProcess === procName;
                        const micros = processesInMacro[procName] || [];
                        const isProcOpen = hasSearch || upEngineFilter !== 'ALL' || !!expandedProcs[procKey];

                        // Filter microprocesses based on upEngineFilter
                        const filteredMicros = micros.filter((m) => {
                          const normMicro = normalizeHeader(m.name);
                          const hasFile = !!upEngineMap[normMicro]?.hasFile;
                          if (upEngineFilter === 'UPLOADED') return hasFile;
                          if (upEngineFilter === 'PENDING') return !hasFile;
                          return true;
                        });

                        if (upEngineFilter !== 'ALL' && filteredMicros.length === 0) {
                          return null;
                        }

                        return (
                          <div
                            key={procName}
                            className={`p-3 rounded-xl border transition-all ${
                              isProcSelected
                                ? 'bg-indigo-50/40 border-indigo-300/80 ring-1 ring-indigo-300/40'
                                : 'bg-white border-slate-200/80 hover:bg-slate-50'
                            }`}
                          >
                            {/* Process Header */}
                            <div
                              onClick={() => {
                                onSelectNode(selectedProject, macroName, procName);
                                if (!isProcOpen) {
                                  toggleProcExpand(procKey);
                                }
                              }}
                              className="flex items-start justify-between gap-2 cursor-pointer group"
                            >
                              <div className="flex items-start gap-2">
                                <GitMerge
                                  size={14}
                                  className={`mt-0.5 shrink-0 ${
                                    isProcSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'
                                  }`}
                                />
                                <div>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Proceso
                                  </span>
                                  <h5
                                    className={`text-xs font-bold leading-snug ${
                                      isProcSelected
                                        ? 'text-indigo-950 font-black'
                                        : 'text-slate-800 group-hover:text-indigo-600'
                                    }`}
                                  >
                                    {procName}
                                  </h5>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] font-extrabold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {filteredMicros.length} micros
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => toggleProcExpand(procKey, e)}
                                  className="p-1 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                                  title={isProcOpen ? 'Contraer Proceso' : 'Expandir Proceso'}
                                >
                                  {isProcOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </div>
                            </div>

                            {/* Microprocesses Chips (shown when process is expanded) */}
                            {isProcOpen && (
                              <div className="space-y-1.5 pt-2.5 mt-2.5 border-t border-slate-200/60">
                                {filteredMicros.length === 0 ? (
                                  <span className="text-[10px] text-slate-400 italic">Sin microprocesos en este filtro</span>
                                ) : (
                                  filteredMicros.map((microNode) => {
                                    const microName = microNode.name;
                                    const isMicroSelected = isProcSelected && selectedMicro === microName;
                                    const normMicro = normalizeHeader(microName);
                                    const status = docStatusMap[normMicro];
                                    const upStatus = upEngineMap[normMicro];

                                    return (
                                      <button
                                        key={microName}
                                        onClick={() =>
                                          onSelectNode(selectedProject, macroName, procName, microName)
                                        }
                                        className={`w-full text-left p-2 rounded-lg text-xs transition-all flex items-center justify-between gap-2 border cursor-pointer ${
                                          isMicroSelected
                                            ? 'bg-indigo-600 text-white font-bold border-indigo-600 shadow-sm shadow-indigo-600/20'
                                            : upStatus?.hasFile
                                              ? 'bg-purple-50/90 border-purple-200/90 text-purple-950 font-semibold hover:bg-purple-100/90'
                                              : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50'
                                        }`}
                                      >
                                        <span className="truncate text-[11px] font-medium leading-tight">
                                          {microName}
                                        </span>

                                        {/* Status Indicators Badges */}
                                        <div className="flex items-center gap-1 shrink-0">
                                          {/* UpEngine Upload Status Badge */}
                                          {upStatus?.hasFile ? (
                                            <span
                                              title={`Subido en UpEngine: ${upStatus.fileName || 'Archivo de proceso registrado'}`}
                                              className={`px-2 py-0.5 rounded text-[9px] font-black flex items-center gap-1 shadow-2xs ${
                                                isMicroSelected
                                                  ? 'bg-purple-300 text-purple-950 font-extrabold'
                                                  : 'bg-purple-600 text-white'
                                              }`}
                                            >
                                              <FileUp size={10} className="shrink-0" />
                                              <span>Subido UpEngine</span>
                                            </span>
                                          ) : (
                                            <span
                                              title="Sin archivo subido en UpEngine"
                                              className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                                isMicroSelected
                                                  ? 'bg-white/10 text-slate-200'
                                                  : 'bg-slate-100 text-slate-400 border border-slate-200/60'
                                              }`}
                                            >
                                              Sin UpEngine
                                            </span>
                                          )}

                                          {/* SGD Document Badges */}
                                          {status?.toBe && (
                                            <span
                                              title="Cuenta con documento TO BE registrado en SGD"
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                                isMicroSelected
                                                  ? 'bg-white/20 text-white'
                                                  : 'bg-indigo-100 text-indigo-700'
                                              }`}
                                            >
                                              TO BE
                                            </span>
                                          )}
                                          {status?.fce && (
                                            <span
                                              title="Cuenta con documento FCE registrado en SGD"
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                                isMicroSelected
                                                  ? 'bg-emerald-400/30 text-white'
                                                  : 'bg-emerald-100 text-emerald-700'
                                              }`}
                                            >
                                              FCE
                                            </span>
                                          )}
                                          {isMicroSelected && (
                                            <Check size={13} className="text-white shrink-0 ml-0.5" />
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

