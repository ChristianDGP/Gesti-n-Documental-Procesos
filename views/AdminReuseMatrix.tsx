
import React, { useState, useEffect, useMemo } from 'react';
import { HierarchyService, DocumentService, normalizeHeader, getStatusInfo, DEFAULT_EXECUTIVE_DEADLINE } from '../services/firebaseBackend';
import { motion, AnimatePresence } from 'motion/react';
import { FullHierarchy, ProcessNode, User, UserRole, Document, DocState, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
  Link as LinkIcon, Search, ChevronRight, ChevronDown, Plus, X, Save, Layers, Network, FolderOpen, FileText, Loader2, AlertCircle, Info, Trash2, ArrowRight, CheckSquare, Square, List, ExternalLink
} from 'lucide-react';

interface Props {
    user: User;
}

const AdminReuseMatrix: React.FC<Props> = ({ user }) => {
  const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const isAdminOrCoord = user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR;

  const [activeTab, setActiveTab] = useState<'LINK' | 'VIEW' | 'INTERSECT'>(() => {
      if (isAdminOrCoord) return 'LINK';
      if (user.canAccessReuseMatrixLink) return 'LINK';
      if (user.canAccessReuseMatrixView) return 'VIEW';
      if (user.canAccessReuseMatrix) return 'INTERSECT';
      return 'LINK';
  });

  const [showOnlyIntersections, setShowOnlyIntersections] = useState(false);
  
  // Selection State: The REU microprocess being managed
  const [selectedReuId, setSelectedReuId] = useState<string | null>(null);

  // View expansion state for usages
  const [expandedUsages, setExpandedUsages] = useState<Set<string>>(new Set());

  const toggleUsage = (reuId: string, usageId: string) => {
    const key = `${reuId}-${usageId}`;
    const newExpanded = new Set(expandedUsages);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedUsages(newExpanded);
  };

  // Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [viewSearchTerm, setViewSearchTerm] = useState('');
  
  // Tree expansion state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hasInitializedExpansion, setHasInitializedExpansion] = useState(false);

  useEffect(() => {
    if (Object.keys(hierarchy).length > 0 && !hasInitializedExpansion) {
      const initialExpanded = new Set<string>();
      Object.keys(hierarchy).forEach(proj => {
        if (proj !== 'REU') initialExpanded.add(`p:${proj}`);
      });
      setExpandedNodes(initialExpanded);
      setHasInitializedExpansion(true);
    }
  }, [hierarchy, hasInitializedExpansion]);

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const isNodeExpanded = (nodeId: string) => expandedNodes.has(nodeId) || treeSearchTerm.length > 0;

  const hasMatch = (proj: string, macro?: string, process?: string) => {
    if (!treeSearchTerm) return true;
    const term = treeSearchTerm.toLowerCase();
    
    const projData = hierarchy[proj];
    if (!projData) return false;

    if (macro && process) {
      const nodes = projData[macro]?.[process];
      return nodes?.some(node => node.name.toLowerCase().includes(term)) || false;
    }

    if (macro) {
      const macroData = projData[macro];
      if (!macroData) return false;
      return Object.values(macroData).some(nodes => 
        nodes.some(node => node.name.toLowerCase().includes(term))
      );
    }

    return Object.values(projData).some(macroData => 
      Object.values(macroData).some(nodes => 
        nodes.some(node => node.name.toLowerCase().includes(term))
      )
    );
  };

  // Permission: Admin, Coordinator, or anyone with specific flags
  const canManage = isAdminOrCoord || 
                   user.canAccessReuseMatrix || 
                   user.canAccessReuseMatrixLink || 
                   user.canAccessReuseMatrixView ||
                   user.canAccessReuseMatrixIntersect;

  useEffect(() => {
      if (activeTab === 'LINK' && user.canAccessReuseMatrixLink === false) {
          if (user.canAccessReuseMatrixView !== false) setActiveTab('VIEW');
          else if (user.canAccessReuseMatrixIntersect !== false) setActiveTab('INTERSECT');
      }
      if (activeTab === 'VIEW' && user.canAccessReuseMatrixView === false) {
          if (user.canAccessReuseMatrixLink !== false) setActiveTab('LINK');
          else if (user.canAccessReuseMatrixIntersect !== false) setActiveTab('INTERSECT');
      }
      if (activeTab === 'INTERSECT' && user.canAccessReuseMatrixIntersect === false) {
          if (user.canAccessReuseMatrixLink !== false) setActiveTab('LINK');
          else if (user.canAccessReuseMatrixView !== false) setActiveTab('VIEW');
      }
  }, [user, activeTab]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const [h, docs] = await Promise.all([
            HierarchyService.getFullHierarchy(),
            DocumentService.getAll()
        ]);
        setHierarchy(h);
        setAllDocs(docs);
    } catch (e) {
        console.error("Error loading data:", e);
    } finally {
        setLoading(false);
    }
  };

  // Map of documents for quick lookup
  const docMap = useMemo(() => {
      const map: Record<string, Document> = {};
      allDocs.forEach(doc => {
          if (doc.project && (doc.microprocess || doc.title)) {
              const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
              const docType = doc.docType || 'AS IS';
              const key = `${normalizeHeader(doc.project)}|${normalizeHeader(microName)}|${normalizeHeader(docType)}`;
              
              const existing = map[key];
              if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                  map[key] = { ...doc, microprocess: microName, docType: docType as DocType };
              }
          }
      });
      return map;
  }, [allDocs]);

  // Get all REU microprocesses
  const reuMicroprocesses = useMemo(() => {
      const list: { id: string, name: string, macro: string, process: string }[] = [];
      const reu = hierarchy['REU'];
      if (!reu) return list;

      Object.keys(reu).forEach(macro => {
          Object.keys(reu[macro]).forEach(process => {
              reu[macro][process].forEach(node => {
                  list.push({
                      id: node.docId,
                      name: node.name,
                      macro,
                      process
                  });
              });
          });
      });
      return list;
  }, [hierarchy]);

  // Find which microprocesses use the selected REU
  const linkedProcessIds = useMemo(() => {
      if (!selectedReuId) return new Set<string>();
      const linked = new Set<string>();
      
      Object.keys(hierarchy).forEach(proj => {
          if (proj === 'REU') return;
          Object.keys(hierarchy[proj]).forEach(macro => {
              Object.keys(hierarchy[proj][macro]).forEach(process => {
                  hierarchy[proj][macro][process].forEach(node => {
                      if (node.reusableLinks?.includes(selectedReuId)) {
                          linked.add(node.docId);
                      }
                  });
              });
          });
      });
      return linked;
  }, [hierarchy, selectedReuId]);

  // Map of REU ID to list of microprocesses using it
  const reuUsageMap = useMemo(() => {
      const map: Record<string, { proj: string, macro: string, process: string, name: string, id: string }[]> = {};
      
      reuMicroprocesses.forEach(reu => {
          map[reu.id] = [];
      });

      Object.keys(hierarchy).forEach(proj => {
          if (proj === 'REU') return;
          Object.keys(hierarchy[proj]).forEach(macro => {
              Object.keys(hierarchy[proj][macro]).forEach(process => {
                  hierarchy[proj][macro][process].forEach(node => {
                      if (node.reusableLinks && node.reusableLinks.length > 0) {
                          node.reusableLinks.forEach(reuId => {
                              if (map[reuId]) {
                                  map[reuId].push({
                                      proj,
                                      macro,
                                      process,
                                      name: node.name,
                                      id: node.docId
                                  });
                              }
                          });
                      }
                  });
              });
          });
      });
      return map;
  }, [hierarchy, reuMicroprocesses]);

  const handleToggleLink = async (targetDocId: string, currentLinks: string[] = []) => {
      if (!selectedReuId) return;
      
      setSavingId(targetDocId);
      try {
          let newLinks: string[];
          if (currentLinks.includes(selectedReuId)) {
              newLinks = currentLinks.filter(id => id !== selectedReuId);
          } else {
              newLinks = [...currentLinks, selectedReuId];
          }
          
          await HierarchyService.updateReusableLinks(targetDocId, newLinks);
          await loadData();
      } catch (err: any) {
          alert('Error al actualizar vínculo: ' + err.message);
      } finally {
          setSavingId(null);
      }
  };

  if (!canManage) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
              <AlertCircle size={48} className="mb-4 opacity-20" />
              <p className="font-bold">Acceso Restringido</p>
              <p className="text-sm">Solo administradores pueden gestionar la matriz de reutilización.</p>
          </div>
      );
  }

  const otherProjects = Object.keys(hierarchy).filter(p => p !== 'REU');

  return (
    <div className="max-w-7xl mx-auto pb-20 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LinkIcon className="text-indigo-600" size={28} />
            Matriz Reutilizables
          </h1>
          <p className="text-slate-500 text-sm">Administre y visualice la relación entre componentes REU y microprocesos base.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            {(isAdminOrCoord || user.canAccessReuseMatrixLink) && (
                <button 
                    onClick={() => setActiveTab('LINK')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'LINK' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <CheckSquare size={14} />
                    Vincular
                </button>
            )}
            {(isAdminOrCoord || user.canAccessReuseMatrixView) && (
                <button 
                    onClick={() => setActiveTab('VIEW')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'VIEW' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <List size={14} />
                    Visualizar
                </button>
            )}
            {(isAdminOrCoord || user.canAccessReuseMatrixIntersect) && (
                <button 
                    onClick={() => setActiveTab('INTERSECT')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'INTERSECT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Network size={14} />
                    Intersección
                </button>
            )}
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button 
                onClick={loadData}
                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Refrescar"
            >
                <Loader2 size={16} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      {activeTab === 'LINK' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Panel Izquierdo: Lista de REU */}
            <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[70vh]">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <div className="flex items-center gap-2 mb-3">
                            <FolderOpen size={16} className="text-indigo-500" />
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Componentes REU</span>
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Buscar REU..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {reuMicroprocesses
                            .filter(reu => !searchTerm || reu.name.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map(reu => (
                            <button 
                                key={reu.id}
                                onClick={() => setSelectedReuId(reu.id)}
                                className={`w-full text-left p-3 rounded-xl transition-all border ${selectedReuId === reu.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'hover:bg-slate-50 border-transparent'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-xs font-bold ${selectedReuId === reu.id ? 'text-indigo-700' : 'text-slate-700'}`}>{reu.name}</span>
                                    {selectedReuId === reu.id && <ChevronRight size={14} className="text-indigo-400" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{reu.macro}</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{reu.process}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Panel Derecho: Árbol de Proyectos para marcar relación */}
            <div className="lg:col-span-8">
                {!selectedReuId ? (
                    <div className="bg-white rounded-3xl border border-slate-200 border-dashed h-[70vh] text-center flex flex-col items-center justify-center text-slate-400">
                        <LinkIcon size={64} className="mb-4 opacity-10" />
                        <p className="font-medium">Seleccione un componente REU</p>
                        <p className="text-xs mt-1">Para marcar qué microprocesos lo utilizan</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[70vh]">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                        <CheckSquare size={18} className="text-indigo-500" />
                                        Vincular a Proyectos Base
                                    </h3>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Marcando un microproceso, este componente REU aparecerá como referencia en su detalle.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex bg-slate-200/50 p-0.5 rounded-lg mr-2">
                                        <button 
                                            onClick={() => {
                                                const all = new Set<string>();
                                                otherProjects.forEach(proj => {
                                                    all.add(`p:${proj}`);
                                                    Object.keys(hierarchy[proj]).forEach(macro => {
                                                        all.add(`m:${proj}|${macro}`);
                                                        Object.keys(hierarchy[proj][macro]).forEach(process => {
                                                            all.add(`s:${proj}|${macro}|${process}`);
                                                        });
                                                    });
                                                });
                                                setExpandedNodes(all);
                                            }}
                                            className="px-2 py-1 text-[9px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-white rounded transition-all"
                                        >
                                            EXPANDIR TODO
                                        </button>
                                        <button 
                                            onClick={() => setExpandedNodes(new Set())}
                                            className="px-2 py-1 text-[9px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-white rounded transition-all"
                                        >
                                            CONTRAER TODO
                                        </button>
                                    </div>
                                    <div className="relative w-full md:w-64">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Filtrar proyectos/procesos..." 
                                            value={treeSearchTerm}
                                            onChange={(e) => setTreeSearchTerm(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-6">
                                {otherProjects.filter(p => hasMatch(p)).map(proj => {
                                    const projId = `p:${proj}`;
                                    const isProjExpanded = isNodeExpanded(projId);
                                    
                                    return (
                                        <div key={proj} className="space-y-3">
                                            <button 
                                                onClick={() => toggleNode(projId)}
                                                className="w-full flex items-center gap-2 border-b border-slate-100 pb-2 hover:bg-slate-50 transition-colors group"
                                            >
                                                {isProjExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                                <Network size={16} className="text-indigo-400" />
                                                <span className="text-xs font-black text-slate-800 uppercase tracking-widest">{proj}</span>
                                            </button>
                                            
                                            {isProjExpanded && (
                                                <div className="grid grid-cols-1 gap-4 animate-fadeIn">
                                                    {Object.keys(hierarchy[proj]).filter(m => hasMatch(proj, m)).map(macro => {
                                                        const macroId = `m:${proj}|${macro}`;
                                                        const isMacroExpanded = isNodeExpanded(macroId);
                                                        
                                                        return (
                                                            <div key={macro} className="bg-slate-50/50 rounded-xl border border-slate-100 p-4">
                                                                <button 
                                                                    onClick={() => toggleNode(macroId)}
                                                                    className="w-full flex items-center gap-2 mb-3 hover:bg-white/50 rounded-lg p-1 transition-colors"
                                                                >
                                                                    {isMacroExpanded ? <ChevronDown size={14} className="text-indigo-400" /> : <ChevronRight size={14} className="text-indigo-400" />}
                                                                    <Layers size={14} className="text-indigo-400" />
                                                                    <span className="text-[11px] font-bold text-slate-600 uppercase">{macro}</span>
                                                                </button>
                                                                
                                                                {isMacroExpanded && (
                                                                    <div className="space-y-4 ml-2 animate-fadeIn">
                                                                        {Object.keys(hierarchy[proj][macro]).filter(p => hasMatch(proj, macro, p)).map(process => {
                                                                            const procId = `s:${proj}|${macro}|${process}`;
                                                                            const isProcExpanded = isNodeExpanded(procId);
                                                                            
                                                                            return (
                                                                                <div key={process} className="space-y-2">
                                                                                    <button 
                                                                                        onClick={() => toggleNode(procId)}
                                                                                        className="flex items-center gap-2 hover:bg-white/50 rounded-lg p-1 transition-colors w-full"
                                                                                    >
                                                                                        {isProcExpanded ? <ChevronDown size={12} className="text-slate-300" /> : <ChevronRight size={12} className="text-slate-300" />}
                                                                                        <FolderOpen size={12} className="text-slate-300" />
                                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{process}</span>
                                                                                    </button>
                                                                                    
                                                                                    {isProcExpanded && (
                                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-4 animate-fadeIn">
                                                                                            {hierarchy[proj][macro][process]
                                                                                                .filter(node => !treeSearchTerm || node.name.toLowerCase().includes(treeSearchTerm.toLowerCase()))
                                                                                                .map(node => {
                                                                                                const isLinked = linkedProcessIds.has(node.docId);
                                                                                                const isSaving = savingId === node.docId;
                                                                                                
                                                                                                return (
                                                                                                    <button 
                                                                                                        key={node.docId}
                                                                                                        onClick={() => handleToggleLink(node.docId, node.reusableLinks || [])}
                                                                                                        disabled={isSaving}
                                                                                                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all text-left ${isLinked ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'}`}
                                                                                                    >
                                                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                                                            {isSaving ? (
                                                                                                                <Loader2 size={14} className="animate-spin text-indigo-500" />
                                                                                                            ) : isLinked ? (
                                                                                                                <CheckSquare size={14} className="text-indigo-600 flex-shrink-0" />
                                                                                                            ) : (
                                                                                                                <Square size={14} className="text-slate-300 flex-shrink-0" />
                                                                                                            )}
                                                                                                            <span className="text-[11px] font-medium truncate">{node.name}</span>
                                                                                                        </div>
                                                                                                    </button>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      ) : activeTab === 'VIEW' ? (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <List size={18} className="text-indigo-500" />
                            Resumen de Vínculos REU
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Vista rápida de todos los componentes REU y sus microprocesos vinculados.</p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre de REU..." 
                            value={viewSearchTerm}
                            onChange={(e) => setViewSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {reuMicroprocesses
                        .filter(reu => !viewSearchTerm || reu.name.toLowerCase().includes(viewSearchTerm.toLowerCase()))
                        .map(reu => {
                            const usages = reuUsageMap[reu.id] || [];
                            return (
                                <div key={reu.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                {reu.name}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{reu.macro}</span>
                                                <span className="text-slate-300">•</span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{reu.process}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${usages.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                                                {usages.length} VÍNCULOS
                                            </span>
                                            <button 
                                                onClick={() => {
                                                    setSelectedReuId(reu.id);
                                                    setActiveTab('LINK');
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shadow-sm border border-transparent hover:border-slate-100"
                                                title="Editar Vínculos"
                                            >
                                                <ExternalLink size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {usages.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic text-center py-4">Este componente no está vinculado a ningún microproceso.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-3">
                                                {usages.map(usage => {
                                                    const usageKey = `${reu.id}-${usage.id}`;
                                                    const isExpanded = expandedUsages.has(usageKey);
                                                    
                                                    return (
                                                        <div key={usage.id} className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden transition-all">
                                                            {/* Summary Row */}
                                                            <button 
                                                                onClick={() => toggleUsage(reu.id, usage.id)}
                                                                className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-left"
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                    {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-xs font-bold text-slate-700 truncate">{usage.name}</p>
                                                                        <div className="flex items-center gap-1 mt-0.5">
                                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{usage.proj}</span>
                                                                            <span className="text-slate-200">/</span>
                                                                            <span className="text-[9px] font-medium text-slate-400 truncate">{usage.macro}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Circles (Status Indicators) */}
                                                                <div className="flex gap-1 ml-4">
                                                                    {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => {
                                                                        const key = `${normalizeHeader(usage.proj)}|${normalizeHeader(usage.name)}|${normalizeHeader(type)}`;
                                                                        const doc = docMap[key];
                                                                        const statusInfo = getStatusInfo(doc || { state: DocState.NOT_STARTED, createdAt: new Date().toISOString(), expectedEndDate: DEFAULT_EXECUTIVE_DEADLINE } as any);
                                                                        
                                                                        return (
                                                                            <div 
                                                                                key={type} 
                                                                                className={`w-2.5 h-2.5 rounded-full ${statusInfo.color} border border-white shadow-sm`}
                                                                                title={`${type}: ${statusInfo.label}`}
                                                                            />
                                                                        );
                                                                    })}
                                                                </div>
                                                            </button>
                                                            
                                                            {/* Expanded Detail */}
                                                            <AnimatePresence>
                                                                {isExpanded && (
                                                                    <motion.div 
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: 'auto', opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <div className="p-4 border-t border-slate-50 bg-slate-50/30">
                                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                                                {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => {
                                                                                    const key = `${normalizeHeader(usage.proj)}|${normalizeHeader(usage.name)}|${normalizeHeader(type)}`;
                                                                                    const doc = docMap[key];
                                                                                    const state = doc?.state || DocState.NOT_STARTED;
                                                                                    const config = STATE_CONFIG[state];
                                                                                    
                                                                                    return (
                                                                                        <div key={type} className="flex flex-col gap-1 bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <span className="text-[8px] font-black text-slate-400">{type}</span>
                                                                                                {doc && (
                                                                                                    <span className="text-[8px] font-mono text-slate-400">{config.progress}%</span>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate ${config.color}`}>
                                                                                                {config.label.split('(')[0]}
                                                                                            </div>
                                                                                            {doc && (
                                                                                                <div className="text-[7px] text-slate-400 mt-1 truncate">
                                                                                                    Act: {new Date(doc.updatedAt).toLocaleDateString()}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <Network size={18} className="text-indigo-500" />
                            Intersección Proyectos vs REU
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Visualice qué componentes REU están integrados en cada microproceso de los proyectos base.</p>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <button 
                            onClick={() => setShowOnlyIntersections(!showOnlyIntersections)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black transition-all border ${showOnlyIntersections ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'}`}
                        >
                            {showOnlyIntersections ? <CheckSquare size={14} /> : <Square size={14} />}
                            SOLO INTERSECCIONES
                        </button>
                        <div className="relative w-full md:w-64">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Buscar en proyectos..." 
                                value={treeSearchTerm}
                                onChange={(e) => setTreeSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {otherProjects.filter(p => {
                        if (!showOnlyIntersections) return hasMatch(p);
                        // If showOnlyIntersections, check if project has any linked microprocess
                        const projData = hierarchy[p];
                        return Object.values(projData).some(macroData => 
                            Object.values(macroData).some(nodes => 
                                nodes.some(node => (node.reusableLinks?.length || 0) > 0 && (!treeSearchTerm || node.name.toLowerCase().includes(treeSearchTerm.toLowerCase())))
                            )
                        );
                    }).map(proj => {
                        const projId = `intersect-p:${proj}`;
                        const isProjExpanded = isNodeExpanded(projId);
                        
                        return (
                            <div key={proj} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                <button 
                                    onClick={() => toggleNode(projId)}
                                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white rounded-lg shadow-sm">
                                            <Network size={16} className="text-indigo-600" />
                                        </div>
                                        <span className="text-sm font-black text-slate-800 uppercase tracking-widest">{proj}</span>
                                    </div>
                                    {isProjExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                </button>

                                {isProjExpanded && (
                                    <div className="p-4 space-y-4 bg-white animate-fadeIn">
                                        {showOnlyIntersections ? (
                                            /* Flattened View: Only Microprocesses with links */
                                            <div className="grid grid-cols-1 gap-2">
                                                {Object.values(hierarchy[proj]).flatMap(macroData => 
                                                    Object.values(macroData).flatMap(nodes => 
                                                        nodes.filter(node => (node.reusableLinks?.length || 0) > 0 && (!treeSearchTerm || node.name.toLowerCase().includes(treeSearchTerm.toLowerCase())))
                                                    )
                                                ).map(node => {
                                                    const linkedReus = (node.reusableLinks || []).map(id => reuMicroprocesses.find(r => r.id === id)).filter(Boolean);
                                                    
                                                    return (
                                                        <div key={node.docId} className="bg-slate-50/50 border border-slate-100 rounded-xl p-3">
                                                            <div className="flex items-center justify-between gap-4 mb-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <FileText size={14} className="text-slate-400 flex-shrink-0" />
                                                                    <span className="text-xs font-bold text-slate-700 truncate">{node.name}</span>
                                                                </div>
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700`}>
                                                                    {linkedReus.length} REU
                                                                </span>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2">
                                                                {linkedReus.map(reu => (
                                                                    <div key={reu!.id} className="flex items-center gap-1.5 bg-white border border-indigo-100 px-2 py-1 rounded-lg shadow-sm">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                                        <span className="text-[10px] font-medium text-slate-600">{reu!.name}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            /* Hierarchical View */
                                            Object.keys(hierarchy[proj]).filter(m => hasMatch(proj, m)).map(macro => {
                                                const macroId = `intersect-m:${proj}|${macro}`;
                                                const isMacroExpanded = isNodeExpanded(macroId);

                                                return (
                                                    <div key={macro} className="space-y-2">
                                                        <button 
                                                            onClick={() => toggleNode(macroId)}
                                                            className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 rounded-xl transition-colors"
                                                        >
                                                            {isMacroExpanded ? <ChevronDown size={14} className="text-indigo-500" /> : <ChevronRight size={14} className="text-indigo-500" />}
                                                            <Layers size={14} className="text-indigo-500" />
                                                            <span className="text-xs font-bold text-slate-600 uppercase">{macro}</span>
                                                        </button>

                                                        {isMacroExpanded && (
                                                            <div className="ml-6 space-y-3 border-l-2 border-slate-50 pl-4 py-2">
                                                                {Object.keys(hierarchy[proj][macro]).filter(p => hasMatch(proj, macro, p)).map(process => {
                                                                    const procId = `intersect-s:${proj}|${macro}|${process}`;
                                                                    const isProcExpanded = isNodeExpanded(procId);

                                                                    return (
                                                                        <div key={process} className="space-y-2">
                                                                            <button 
                                                                                onClick={() => toggleNode(procId)}
                                                                                className="flex items-center gap-2 p-1 hover:bg-slate-50 rounded-lg transition-colors w-full"
                                                                            >
                                                                                {isProcExpanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                                                <FolderOpen size={12} className="text-slate-400" />
                                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{process}</span>
                                                                            </button>

                                                                            {isProcExpanded && (
                                                                                <div className="grid grid-cols-1 gap-2 ml-4">
                                                                                    {hierarchy[proj][macro][process]
                                                                                        .filter(node => !treeSearchTerm || node.name.toLowerCase().includes(treeSearchTerm.toLowerCase()))
                                                                                        .map(node => {
                                                                                            const linkedReus = (node.reusableLinks || []).map(id => reuMicroprocesses.find(r => r.id === id)).filter(Boolean);
                                                                                            
                                                                                            return (
                                                                                                <div key={node.docId} className="bg-slate-50/50 border border-slate-100 rounded-xl p-3">
                                                                                                    <div className="flex items-center justify-between gap-4 mb-2">
                                                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                                                            <FileText size={14} className="text-slate-400 flex-shrink-0" />
                                                                                                            <span className="text-xs font-bold text-slate-700 truncate">{node.name}</span>
                                                                                                        </div>
                                                                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${linkedReus.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                                                                                                            {linkedReus.length} REU
                                                                                                        </span>
                                                                                                    </div>

                                                                                                    {linkedReus.length > 0 ? (
                                                                                                        <div className="flex flex-wrap gap-2">
                                                                                                            {linkedReus.map(reu => (
                                                                                                                <div key={reu!.id} className="flex items-center gap-1.5 bg-white border border-indigo-100 px-2 py-1 rounded-lg shadow-sm">
                                                                                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                                                                                    <span className="text-[10px] font-medium text-slate-600">{reu!.name}</span>
                                                                                                                </div>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    ) : (
                                                                                                        <p className="text-[9px] text-slate-400 italic">Sin componentes reutilizables vinculados.</p>
                                                                                                    )}
                                                                                                </div>
                                                                                            );
                                                                                        })}
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
                    })}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminReuseMatrix;
